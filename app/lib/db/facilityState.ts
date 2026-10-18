import { prisma } from "./prisma";
import { bucketOf } from "../metrics";
import { computeFacilityState, EMPTY_EXPOSURE, WINDOW_DAYS, type FacilityState, type GameExposure, type StateEntry } from "../facilityState";
import type { LogScope } from "./facilityLog";

// Estado calculado de las facilities (Fase 2). Sin caché: depende de aportes que se cargan a mano y de
// partidos de los últimos 90 días; una consulta de aportes + un groupBy de partidos por facility.

export type FacilityStateRow = {
  facilityId: string;
  facilityName: string;
  marketId: string;
  marketName: string;
  state: FacilityState;
  /** Tasa de demanda de todo el market en los mismos 90 días, para comparar. */
  marketDemandRate: number | null;
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const AVAILABILITY = ["RETIRO_SLOT", "LIBERACION_TARDIA"];

/** Estado de cada facility del alcance que tenga al menos un aporte. */
export async function getFacilityStates(scope: LogScope, today: string): Promise<FacilityStateRow[]> {
  const facilityWhere = scope.facilityId
    ? { id: scope.facilityId }
    : scope.marketId
      ? { marketId: scope.marketId }
      : scope.regionId
        ? { market: { regionId: scope.regionId } }
        : {};
  const logged = await prisma.facilityLogEntry.findMany({
    where: { facility: facilityWhere },
    select: {
      facilityId: true, kind: true, eventType: true, subtype: true, tone: true, resolution: true, severity: true,
      committedSlot: true, hours: true, hoursSincePublished: true, playersSigned: true, sentiment: true,
      authorId: true, occurredAt: true, gameId: true,
      reactions: { select: { agrees: true } },
      facility: { select: { name: true, marketId: true, market: { select: { name: true } } } },
    },
  });
  if (logged.length === 0) return [];

  const byFacility = new Map<string, { name: string; marketId: string; marketName: string; entries: StateEntry[]; gameIds: number[] }>();
  for (const r of logged) {
    let f = byFacility.get(r.facilityId);
    if (!f) {
      f = { name: r.facility.name, marketId: r.facility.marketId, marketName: r.facility.market.name, entries: [], gameIds: [] };
      byFacility.set(r.facilityId, f);
    }
    f.entries.push({
      kind: r.kind, eventType: r.eventType, subtype: r.subtype, tone: r.tone, resolution: r.resolution, severity: r.severity,
      committedSlot: r.committedSlot, hours: r.hours, hoursSincePublished: r.hoursSincePublished, playersSigned: r.playersSigned,
      sentiment: r.sentiment, authorId: r.authorId, occurredAt: r.occurredAt.toISOString().slice(0, 10),
      agree: r.reactions.filter((x) => x.agrees).length,
      disagree: r.reactions.filter((x) => !x.agrees).length,
    });
    if (r.gameId !== null && r.eventType && AVAILABILITY.includes(r.eventType)) f.gameIds.push(r.gameId);
  }

  const since = new Date(`${addDays(today, -WINDOW_DAYS + 1)}T00:00:00Z`);
  const until = new Date(`${today}T00:00:00Z`);
  const marketIds = [...new Set([...byFacility.values()].map((f) => f.marketId))];
  const allGameIds = [...new Set([...byFacility.values()].flatMap((f) => f.gameIds))];

  const [grouped, linked] = await Promise.all([
    // Partidos de los últimos 90 días de todas las facilities de los markets involucrados (la comparación es contra el market).
    prisma.game.groupBy({
      by: ["facilityId", "status", "cancellationCategory"],
      where: { date: { gte: since, lte: until }, facility: { marketId: { in: marketIds } } },
      _count: { _all: true },
    }),
    allGameIds.length
      ? prisma.game.findMany({
          where: { id: { in: allGameIds }, status: "CANCELLED", date: { gte: since, lte: until } },
          select: { id: true, facilityId: true, cancellationCategory: true },
        })
      : Promise.resolve([]),
  ]);

  const facilityMarket = new Map<string, string>();
  if (grouped.length) {
    const ids = [...new Set(grouped.map((g) => g.facilityId))];
    const fs = await prisma.facility.findMany({ where: { id: { in: ids } }, select: { id: true, marketId: true } });
    for (const f of fs) facilityMarket.set(f.id, f.marketId);
  }

  const exposure = new Map<string, GameExposure>();
  const marketCounts = new Map<string, { confirmed: number; demandCancelled: number }>();
  for (const g of grouped) {
    const n = g._count._all;
    const e = exposure.get(g.facilityId) ?? { ...EMPTY_EXPOSURE };
    const mk = marketCounts.get(facilityMarket.get(g.facilityId) ?? "") ?? { confirmed: 0, demandCancelled: 0 };
    if (g.status === "CONFIRMED") {
      e.confirmed += n;
      mk.confirmed += n;
    } else if (bucketOf(g.cancellationCategory) !== "plugin") {
      e.cancelled += n;
      if (g.cancellationCategory === "FACILITY_UNAVAILABLE") e.facilityCancelled += n;
      if (bucketOf(g.cancellationCategory) === "demand") {
        e.demandCancelled += n;
        mk.demandCancelled += n;
      }
    }
    exposure.set(g.facilityId, e);
    marketCounts.set(facilityMarket.get(g.facilityId) ?? "", mk);
  }
  // Partidos de eventos de disponibilidad que se cancelaron por otro motivo: se suman sin contar dos veces los que ya son FACILITY_UNAVAILABLE.
  for (const g of linked) {
    if (g.cancellationCategory === "FACILITY_UNAVAILABLE" || bucketOf(g.cancellationCategory) === "plugin") continue;
    const e = exposure.get(g.facilityId);
    if (e) e.linkedCancelled += 1;
  }

  return [...byFacility.entries()].map(([facilityId, f]) => {
    const mk = marketCounts.get(f.marketId);
    const base = mk ? mk.confirmed + mk.demandCancelled : 0;
    return {
      facilityId,
      facilityName: f.name,
      marketId: f.marketId,
      marketName: f.marketName,
      state: computeFacilityState(f.entries, exposure.get(facilityId) ?? EMPTY_EXPOSURE, today),
      marketDemandRate: base > 0 ? mk!.confirmed / base : null,
    };
  });
}
