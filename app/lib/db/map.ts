import { GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { bucketOf } from "../metrics";
import { buildWhere, type OverviewFilters } from "./shared";
import { buildZones, type MapFacility, type MapZone } from "../mapZones";

// Datos del mapa por zonas. "Zona fuerte" = más partidos confirmados (volumen),
// decisión de Ivan. Ojo con la lectura: esto muestra DÓNDE OPERA Plei, no la
// demanda potencial de la zona — una zona con pocos partidos puede ser una zona
// donde todavía casi no hay oferta.

export type MapData = {
  zones: MapZone[];
  mappedFacilities: number;
  unmapped: { facilities: number; confirmedGames: number; names: string[] }; // con partidos pero sin coordenadas
};

type GroupRow = { facilityId: string; status: GameStatus; cancellationCategory: string | null; _count: { _all: number }; _sum: { eventRevenue: number | null } };
type FieldRow = { facilityId: string; fieldName: string | null };
type FacilityRow = {
  id: string;
  name: string;
  market: { name: string; region: { name: string } };
  profile: {
    latitude: number | null; longitude: number | null; geoPrecision: string | null;
    city: string | null; state: string | null; postalCode: string | null;
  } | null;
};

async function getMapDataImpl(filters: OverviewFilters): Promise<MapData> {
  const where = buildWhere(filters);
  const [groups, fieldRows] = await Promise.all([
    prisma.game.groupBy({ by: ["facilityId", "status", "cancellationCategory"], where, _count: { _all: true }, _sum: { eventRevenue: true } }) as unknown as Promise<GroupRow[]>,
    prisma.game.groupBy({ by: ["facilityId", "fieldName"], where: { ...where, fieldName: { not: null } }, _count: { _all: true } }) as unknown as Promise<FieldRow[]>,
  ]);

  const stats = new Map<string, { confirmed: number; cancelled: number; demandCancelled: number; revenue: number }>();
  for (const g of groups) {
    const s = stats.get(g.facilityId) ?? { confirmed: 0, cancelled: 0, demandCancelled: 0, revenue: 0 };
    if (g.status === GameStatus.CONFIRMED) { s.confirmed += g._count._all; s.revenue += g._sum.eventRevenue ?? 0; }
    else {
      s.cancelled += g._count._all;
      if (bucketOf(g.cancellationCategory) === "demand") s.demandCancelled += g._count._all;
    }
    stats.set(g.facilityId, s);
  }
  const fieldsByFacility = new Map<string, number>();
  for (const r of fieldRows) fieldsByFacility.set(r.facilityId, (fieldsByFacility.get(r.facilityId) ?? 0) + 1);

  const ids = [...stats.keys()];
  const facilities = (await prisma.facility.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true,
      market: { select: { name: true, region: { select: { name: true } } } },
      profile: { select: { latitude: true, longitude: true, geoPrecision: true, city: true, state: true, postalCode: true } },
    },
  })) as unknown as FacilityRow[];

  const mapped: MapFacility[] = [];
  const unmappedNames: string[] = [];
  let unmappedConfirmed = 0;
  for (const f of facilities) {
    const s = stats.get(f.id)!;
    const p = f.profile;
    if (!p || p.latitude === null || p.longitude === null) {
      unmappedNames.push(f.name);
      unmappedConfirmed += s.confirmed;
      continue;
    }
    const fields = fieldsByFacility.get(f.id) ?? null;
    mapped.push({
      id: f.id, name: f.name, marketName: f.market.name, regionName: f.market.region.name,
      latitude: p.latitude, longitude: p.longitude, approximate: p.geoPrecision === "POSTAL_CODE",
      city: p.city, state: p.state, postalCode: p.postalCode,
      confirmedGames: s.confirmed, cancelledGames: s.cancelled, demandCancelledGames: s.demandCancelled, scheduledGames: s.confirmed + s.cancelled,
      confirmationRate: s.confirmed + s.demandCancelled > 0 ? s.confirmed / (s.confirmed + s.demandCancelled) : null,
      revenue: s.revenue, fields, gamesPerField: fields ? s.confirmed / fields : null,
    });
  }

  return {
    zones: buildZones(mapped),
    mappedFacilities: mapped.length,
    unmapped: { facilities: unmappedNames.length, confirmedGames: unmappedConfirmed, names: unmappedNames.sort() },
  };
}

export const getMapData = cached("getMapData", getMapDataImpl);

// ---------- Detalle de facility: partidos publicados por cancha / día / hora / formato ----------

export type InventoryRow = {
  dayOfWeek: string;
  time: string;
  fieldName: string | null;
  gameSize: string | null;
  scheduled: number; // confirmados + cancelados
  confirmed: number;
  cancelled: number;
  demandCancelled: number;
  confirmationRate: number | null; // % de demanda
  avgPrice: number | null;
  avgPlayers: number | null;
  revenue: number;
};

type InvGroup = {
  dayOfWeek: string; time: string; fieldName: string | null; gameSize: string | null; status: GameStatus; cancellationCategory: string | null;
  _count: { _all: number }; _sum: { eventRevenue: number | null }; _avg: { gamePrice: number | null; finalPlayers: number | null };
};

// Identidad de un partido (decisión de Ivan): facility + día + hora + cancha + formato.
// Cancha 1 6v6 y Cancha 3 6v6 a la misma hora son dos partidos distintos.
async function getFacilityInventoryImpl(filters: OverviewFilters): Promise<InventoryRow[]> {
  const rows = (await prisma.game.groupBy({
    by: ["dayOfWeek", "time", "fieldName", "gameSize", "status", "cancellationCategory"],
    where: buildWhere(filters),
    _count: { _all: true },
    _sum: { eventRevenue: true },
    _avg: { gamePrice: true, finalPlayers: true },
  })) as unknown as InvGroup[];

  const merged = new Map<string, InventoryRow & { priceW: number; priceN: number; playersW: number; playersN: number }>();
  for (const r of rows) {
    const k = `${r.dayOfWeek}|${r.time}|${r.fieldName ?? ""}|${r.gameSize ?? ""}`;
    const m = merged.get(k) ?? {
      dayOfWeek: r.dayOfWeek, time: r.time, fieldName: r.fieldName, gameSize: r.gameSize,
      scheduled: 0, confirmed: 0, cancelled: 0, demandCancelled: 0, confirmationRate: null, avgPrice: null, avgPlayers: null, revenue: 0,
      priceW: 0, priceN: 0, playersW: 0, playersN: 0,
    };
    m.scheduled += r._count._all;
    if (r.status === GameStatus.CONFIRMED) {
      m.confirmed += r._count._all;
      m.revenue += r._sum.eventRevenue ?? 0;
      if (r._avg.finalPlayers !== null) { m.playersW += r._avg.finalPlayers * r._count._all; m.playersN += r._count._all; }
    } else {
      m.cancelled += r._count._all;
      if (bucketOf(r.cancellationCategory) === "demand") m.demandCancelled += r._count._all;
    }
    if (r._avg.gamePrice !== null) { m.priceW += r._avg.gamePrice * r._count._all; m.priceN += r._count._all; }
    merged.set(k, m);
  }
  return [...merged.values()].map((m) => ({
    dayOfWeek: m.dayOfWeek, time: m.time, fieldName: m.fieldName, gameSize: m.gameSize,
    scheduled: m.scheduled, confirmed: m.confirmed, cancelled: m.cancelled, demandCancelled: m.demandCancelled,
    confirmationRate: m.confirmed + m.demandCancelled > 0 ? m.confirmed / (m.confirmed + m.demandCancelled) : null,
    avgPrice: m.priceN > 0 ? m.priceW / m.priceN : null,
    avgPlayers: m.playersN > 0 ? m.playersW / m.playersN : null,
    revenue: m.revenue,
  }));
}

export const getFacilityInventory = cached("getFacilityInventory", getFacilityInventoryImpl);
