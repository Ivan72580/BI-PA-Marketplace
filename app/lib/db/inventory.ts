import { GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, type OverviewFilters } from "./shared";

// Inventario a nivel de partido recurrente ("slot").
//
// Identidad (decisión de Ivan): facility + día + hora + cancha + formato.
// Cancha 1 6v6 y Cancha 3 6v6 a la misma hora son dos slots distintos. Solo se
// agrupan ocurrencias que coinciden en las cinco cosas. Inventario = oferta
// publicada (Confirmados + Cancelados), igual que en el mapa.
//
// Limitación a tener presente al leer: ~21% de los partidos no trae
// identificador de cancha (fieldName null). Esos se agrupan juntos bajo
// "cancha sin identificar", y dos canchas distintas con mismo día/hora/formato
// pueden quedar fusionadas en un único slot. El slot lo marca (fieldKnown=false).

export type SlotSort = "volume" | "rateAsc" | "rateDesc" | "fillAsc" | "revenue";
export const SLOT_SORTS: SlotSort[] = ["volume", "rateAsc", "rateDesc", "fillAsc", "revenue"];
export const MIN_SLOT_SAMPLE = 3; // por debajo, las tasas son ruido (no entran a los orden por tasa)
const MAX_GAMES_READ = 40000;

export type SlotOccurrence = { date: string; status: "CONFIRMED" | "CANCELLED"; players: number };

export type Slot = {
  key: string;
  facilityId: string;
  facilityName: string;
  marketName: string;
  dayOfWeek: string;
  time: string;
  fieldName: string | null;
  fieldKnown: boolean;
  gameSize: string | null;
  scheduled: number;
  confirmed: number;
  cancelled: number;
  confirmationRate: number | null;
  avgPlayers: number | null;
  capacity: number | null; // promedio de maxPlayers
  fillRate: number | null; // jugadores / capacidad, solo en confirmados
  avgPrice: number | null;
  revenue: number;
  lastDate: string;
  recent: SlotOccurrence[]; // últimas ocurrencias, de la más vieja a la más nueva
  lowSample: boolean;
};

export type SlotInventory = {
  slots: Slot[]; // ya ordenados y recortados a `limit`
  totalSlots: number; // antes de recortar
  totalScheduled: number;
  unknownFieldSlots: number;
  truncated: boolean; // se leyó el tope de partidos: faltan datos más viejos
};

export type SlotQuery = { sort: SlotSort; limit: number; dayOfWeek?: string };

type Acc = {
  facilityId: string; dayOfWeek: string; time: string; fieldName: string | null; gameSize: string | null;
  confirmed: number; cancelled: number; players: number; capacityConfirmed: number; capacitySum: number; capacityN: number;
  priceSum: number; priceN: number; revenue: number; occ: (SlotOccurrence & { t: number })[]; last: number;
};

function sortSlots(slots: Slot[], sort: SlotSort): Slot[] {
  const solid = (s: Slot) => !s.lowSample;
  const out = [...slots];
  switch (sort) {
    case "rateAsc": {
      const pool = out.filter(solid);
      return pool.sort((a, b) => (a.confirmationRate ?? 1) - (b.confirmationRate ?? 1) || b.scheduled - a.scheduled);
    }
    case "rateDesc": {
      const pool = out.filter(solid);
      return pool.sort((a, b) => (b.confirmationRate ?? 0) - (a.confirmationRate ?? 0) || b.scheduled - a.scheduled);
    }
    case "fillAsc": {
      const pool = out.filter((s) => solid(s) && s.fillRate !== null);
      return pool.sort((a, b) => (a.fillRate ?? 1) - (b.fillRate ?? 1) || b.confirmed - a.confirmed);
    }
    case "revenue":
      return out.sort((a, b) => b.revenue - a.revenue);
    default:
      return out.sort((a, b) => b.scheduled - a.scheduled || a.facilityName.localeCompare(b.facilityName));
  }
}

async function getSlotInventoryImpl(filters: OverviewFilters, query: SlotQuery): Promise<SlotInventory> {
  const where = buildWhere(filters);
  if (query.dayOfWeek) where.dayOfWeek = query.dayOfWeek;

  const games = await prisma.game.findMany({
    where,
    select: {
      facilityId: true, date: true, time: true, dayOfWeek: true, fieldName: true, gameSize: true, status: true,
      finalPlayers: true, maxPlayers: true, gamePrice: true, eventRevenue: true,
    },
    orderBy: { date: "desc" },
    take: MAX_GAMES_READ,
  });
  const truncated = games.length >= MAX_GAMES_READ;

  const acc = new Map<string, Acc>();
  for (const g of games) {
    const key = `${g.facilityId}|${g.dayOfWeek}|${g.time}|${g.fieldName ?? ""}|${g.gameSize ?? ""}`;
    let a = acc.get(key);
    if (!a) {
      a = {
        facilityId: g.facilityId, dayOfWeek: g.dayOfWeek, time: g.time, fieldName: g.fieldName, gameSize: g.gameSize,
        confirmed: 0, cancelled: 0, players: 0, capacityConfirmed: 0, capacitySum: 0, capacityN: 0,
        priceSum: 0, priceN: 0, revenue: 0, occ: [], last: 0,
      };
      acc.set(key, a);
    }
    const t = g.date.getTime();
    if (t > a.last) a.last = t;
    const confirmed = g.status === GameStatus.CONFIRMED;
    if (confirmed) {
      a.confirmed += 1;
      a.players += g.finalPlayers;
      a.capacityConfirmed += g.maxPlayers;
      a.revenue += g.eventRevenue ?? 0;
    } else {
      a.cancelled += 1;
    }
    a.capacitySum += g.maxPlayers; a.capacityN += 1;
    if (g.gamePrice !== null) { a.priceSum += g.gamePrice; a.priceN += 1; }
    if (a.occ.length < 8) a.occ.push({ t, date: g.date.toISOString().slice(0, 10), status: confirmed ? "CONFIRMED" : "CANCELLED", players: g.finalPlayers });
  }

  const facilityIds = [...new Set([...acc.values()].map((a) => a.facilityId))];
  const facilities = (await prisma.facility.findMany({
    where: { id: { in: facilityIds } },
    select: { id: true, name: true, market: { select: { name: true } } },
  })) as { id: string; name: string; market: { name: string } }[];
  const fac = new Map(facilities.map((f) => [f.id, f]));

  const all: Slot[] = [...acc.entries()].map(([key, a]) => {
    const scheduled = a.confirmed + a.cancelled;
    return {
      key,
      facilityId: a.facilityId,
      facilityName: fac.get(a.facilityId)?.name ?? a.facilityId,
      marketName: fac.get(a.facilityId)?.market.name ?? "",
      dayOfWeek: a.dayOfWeek, time: a.time, fieldName: a.fieldName, fieldKnown: a.fieldName !== null, gameSize: a.gameSize,
      scheduled, confirmed: a.confirmed, cancelled: a.cancelled,
      confirmationRate: scheduled > 0 ? a.confirmed / scheduled : null,
      avgPlayers: a.confirmed > 0 ? a.players / a.confirmed : null,
      capacity: a.capacityN > 0 ? a.capacitySum / a.capacityN : null,
      fillRate: a.capacityConfirmed > 0 ? a.players / a.capacityConfirmed : null,
      avgPrice: a.priceN > 0 ? a.priceSum / a.priceN : null,
      revenue: a.revenue,
      lastDate: new Date(a.last).toISOString().slice(0, 10),
      recent: [...a.occ].sort((x, y) => x.t - y.t).map(({ date, status, players }) => ({ date, status, players })),
      lowSample: scheduled < MIN_SLOT_SAMPLE,
    };
  });

  const sorted = sortSlots(all, query.sort);
  return {
    slots: sorted.slice(0, query.limit),
    totalSlots: all.length,
    totalScheduled: all.reduce((s, x) => s + x.scheduled, 0),
    unknownFieldSlots: all.filter((s) => !s.fieldKnown).length,
    truncated,
  };
}

export const getSlotInventory = cached("getSlotInventory", getSlotInventoryImpl);
