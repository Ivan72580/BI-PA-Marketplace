import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, type OverviewFilters } from "./shared";
import { bucketOf } from "../metrics";
import { getLatestDataDate } from "./freshness";
import { todayISO } from "../period";
import {
  seasonalIndex,
  groupSeasons,
  availabilityByMonth,
  classify,
  leadWeeks,
  isCompleteMonth,
  levelOf,
  type ActionKind,
  type AvailabilityMonth,
  type MonthAgg,
  type SeasonLevel,
} from "../seasonPlanCalc";

// ---------- Temporadas por volumen de demanda + disponibilidad + plan de reservas ----------
// Ver app/lib/seasonPlanCalc.ts para las definiciones. Esta capa solo trae agregados de la
// base (groupBy, nunca filas sueltas) y arma las vistas. Devuelve datos planos (sin Date) porque
// pasa por unstable_cache.

const PLAN_MONTHS_AHEAD = 3; // meses por delante (desde el mes siguiente) para el plan de reservas
const PLAN_HISTORY_YEARS = 3; // años hacia atrás de los que se mira "el mismo mes"
const PLAN_MAX_ITEMS = 40;
const PLAN_QUERY_CONCURRENCY = 4; // el pool de conexiones es chico: no disparar todo junto
const MIN_FACILITY_TREND_PUBLISHED = 10; // por año, para comparar la tasa de una facility en un mes

type FilterArgs = Omit<OverviewFilters, "dateFrom" | "dateTo">;

type NetworkRow = { date: Date; status: string; cancellationCategory: string | null; _count: { _all: number } };
type FacilityRow = { facilityId: string; status: string; cancellationCategory: string | null; _count: { _all: number } };

export type SeasonRow = {
  months: number[];
  level: SeasonLevel;
  avgIndex: number;
  shareOfDemandVolume: number | null;
  demandRate: number | null;
  unavailRate: number | null;
  trendPp: number | null;
  avgLostPerYear: number | null;
  action: ActionKind;
};

export type PlanItem = {
  facilityId: string;
  facilityName: string;
  year: number;
  month: number;
  kind: "supplyLimited" | "mixed";
  demandRate: number;
  unavailRate: number;
  trendPp: number | null;
  avgLostPerYear: number;
  leadWeeks: number;
  reserveBy: string; // YYYY-MM-DD
  overdue: boolean;
  yearsObserved: number;
};

export type PlanMonth = {
  year: number;
  month: number;
  index: number | null;
  level: SeasonLevel | null;
  counts: Record<ActionKind, number>;
};

export type SeasonPlanData = {
  firstDate: string;
  latestDate: string;
  completeMonths: number;
  method: "centeredMA" | "provisional" | null;
  index: { month: number; index: number | null; observations: number; avgDemandVolume: number | null }[];
  availability: AvailabilityMonth[];
  seasons: SeasonRow[];
  planMonths: PlanMonth[];
  planItems: PlanItem[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

type Tally = { published: number; confirmed: number; demandCancelled: number; fieldUnavailable: number };
const emptyTally = (): Tally => ({ published: 0, confirmed: 0, demandCancelled: 0, fieldUnavailable: 0 });
function addRow(t: Tally, status: string, category: string | null, n: number) {
  t.published += n;
  if (status === "CONFIRMED") t.confirmed += n;
  else {
    const b = bucketOf(category);
    if (b === "demand") t.demandCancelled += n;
    else if (b === "fieldUnavailable") t.fieldUnavailable += n;
  }
}

async function runChunked<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < tasks.length; i += size) out.push(...(await Promise.all(tasks.slice(i, i + size).map((f) => f()))));
  return out;
}

async function getSeasonPlanImpl(filters: FilterArgs, today: string): Promise<SeasonPlanData | null> {
  const latest = await getLatestDataDate();
  if (!latest) return null;
  const baseWhere = buildWhere(filters);
  const first = await prisma.game.aggregate({ _min: { date: true }, where: baseWhere });
  if (!first._min.date) return null;
  const firstDate = iso(first._min.date);

  // 1) Serie mensual de la red (o del filtro): un groupBy por día/estado/categoría y se suma en JS.
  const rows = (await prisma.game.groupBy({
    by: ["date", "status", "cancellationCategory"],
    where: { ...baseWhere, date: { lte: new Date(`${latest}T00:00:00.000Z`) } },
    _count: { _all: true },
  })) as unknown as NetworkRow[];

  const monthly = new Map<number, { year: number; month: number; t: Tally }>();
  for (const r of rows) {
    const y = r.date.getUTCFullYear();
    const m = r.date.getUTCMonth();
    const k = y * 12 + m;
    let e = monthly.get(k);
    if (!e) monthly.set(k, (e = { year: y, month: m, t: emptyTally() }));
    addRow(e.t, r.status, r.cancellationCategory, Number(r._count._all));
  }
  const complete: MonthAgg[] = [...monthly.values()]
    .filter((e) => isCompleteMonth(e.year, e.month, firstDate, latest))
    .map((e) => ({
      year: e.year,
      month: e.month,
      published: e.t.published,
      confirmed: e.t.confirmed,
      demandBase: e.t.confirmed + e.t.demandCancelled,
      fieldUnavailable: e.t.fieldUnavailable,
    }));

  const idx = seasonalIndex(complete);
  const availability = availabilityByMonth(complete);
  const indexByMonth = idx?.byMonth ?? Array.from({ length: 12 }, (_, month) => ({ month, index: null, observations: 0, avgDemandVolume: null }));

  // 2) Temporadas con su lectura (tasa de demanda, cancha no disponible, tendencia).
  const totalVolume = indexByMonth.reduce((a, m) => a + (m.avgDemandVolume ?? 0), 0);
  const seasons: SeasonRow[] = idx
    ? groupSeasons(indexByMonth).map((s) => {
        const ms = complete.filter((m) => s.months.includes(m.month));
        const published = ms.reduce((a, m) => a + m.published, 0);
        const confirmed = ms.reduce((a, m) => a + m.confirmed, 0);
        const demandBase = ms.reduce((a, m) => a + m.demandBase, 0);
        const fu = ms.reduce((a, m) => a + m.fieldUnavailable, 0);
        const demandRate = demandBase > 0 ? confirmed / demandBase : null;
        const unavailRate = published > 0 ? fu / published : null;
        const trends = s.months.map((m) => availability[m].trendPp).filter((x): x is number => x !== null);
        const trendPp = trends.length ? trends.reduce((a, b) => a + b, 0) / trends.length : null;
        const yearsSeen = Math.max(1, ...s.months.map((m) => availability[m].years));
        return {
          months: s.months,
          level: s.level,
          avgIndex: s.avgIndex,
          shareOfDemandVolume: totalVolume > 0 ? s.months.reduce((a, m) => a + (indexByMonth[m].avgDemandVolume ?? 0), 0) / totalVolume : null,
          demandRate,
          unavailRate,
          trendPp,
          avgLostPerYear: fu / yearsSeen,
          action: classify({ published, demandRate, unavailRate, trendPp }),
        };
      })
    : [];

  // 3) Plan de reservas por facility para los próximos meses, mirando el MISMO mes de años anteriores.
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const targets = Array.from({ length: PLAN_MONTHS_AHEAD }, (_, i) => {
    const d = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1 + i, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });

  type Win = { target: number; year: number; start: Date; end: Date };
  const windows: Win[] = [];
  targets.forEach((tg, ti) => {
    for (let back = 1; back <= PLAN_HISTORY_YEARS; back++) {
      const y = tg.year - back;
      if (isCompleteMonth(y, tg.month, firstDate, latest)) {
        windows.push({ target: ti, year: y, start: new Date(Date.UTC(y, tg.month, 1)), end: new Date(Date.UTC(y, tg.month + 1, 0)) });
      }
    }
  });

  const winRows = await runChunked(
    windows.map((w) => async () => ({
      w,
      rows: (await prisma.game.groupBy({
        by: ["facilityId", "status", "cancellationCategory"],
        where: { ...buildWhere({ ...filters, dateFrom: w.start, dateTo: w.end }) },
        _count: { _all: true },
      })) as unknown as FacilityRow[],
    })),
    PLAN_QUERY_CONCURRENCY
  );

  // facilityId -> target -> year -> Tally
  const acc = new Map<string, Map<number, Map<number, Tally>>>();
  for (const { w, rows: rs } of winRows) {
    for (const r of rs) {
      const byTarget = acc.get(r.facilityId) ?? new Map<number, Map<number, Tally>>();
      acc.set(r.facilityId, byTarget);
      const byYear = byTarget.get(w.target) ?? new Map<number, Tally>();
      byTarget.set(w.target, byYear);
      const t = byYear.get(w.year) ?? emptyTally();
      byYear.set(w.year, t);
      addRow(t, r.status, r.cancellationCategory, Number(r._count._all));
    }
  }

  const counts = targets.map(() => ({ supplyLimited: 0, demandLimited: 0, mixed: 0, healthy: 0, insufficient: 0 }) as Record<ActionKind, number>);
  const candidates: Omit<PlanItem, "facilityName">[] = [];
  for (const [facilityId, byTarget] of acc.entries()) {
    for (const [ti, byYear] of byTarget.entries()) {
      const years = [...byYear.keys()].sort((a, b) => a - b);
      const sum = emptyTally();
      for (const y of years) {
        const t = byYear.get(y)!;
        sum.published += t.published;
        sum.confirmed += t.confirmed;
        sum.demandCancelled += t.demandCancelled;
        sum.fieldUnavailable += t.fieldUnavailable;
      }
      const demandBase = sum.confirmed + sum.demandCancelled;
      const demandRate = demandBase > 0 ? sum.confirmed / demandBase : null;
      const unavailRate = sum.published > 0 ? sum.fieldUnavailable / sum.published : null;
      const l = byYear.get(years[years.length - 1])!;
      const p = years.length >= 2 ? byYear.get(years[years.length - 2])! : null;
      const trendPp =
        p && l.published >= MIN_FACILITY_TREND_PUBLISHED && p.published >= MIN_FACILITY_TREND_PUBLISHED
          ? l.fieldUnavailable / l.published - p.fieldUnavailable / p.published
          : null;
      const kind = classify({ published: sum.published, demandRate, unavailRate, trendPp });
      counts[ti][kind] += 1;
      if ((kind === "supplyLimited" || kind === "mixed") && demandRate !== null && unavailRate !== null) {
        const weeks = leadWeeks(unavailRate, trendPp);
        const tg = targets[ti];
        const reserveBy = new Date(Date.UTC(tg.year, tg.month, 1) - weeks * 7 * 86_400_000);
        candidates.push({
          facilityId,
          year: tg.year,
          month: tg.month,
          kind,
          demandRate,
          unavailRate,
          trendPp,
          avgLostPerYear: sum.fieldUnavailable / years.length,
          leadWeeks: weeks,
          reserveBy: iso(reserveBy),
          overdue: reserveBy.getTime() < todayDate.getTime(),
          yearsObserved: years.length,
        });
      }
    }
  }
  // Primero lo accionable (oferta limitada), después "revisar"; dentro de cada grupo, lo que más volumen pierde.
  candidates.sort((a, b) => (a.kind === b.kind ? b.avgLostPerYear - a.avgLostPerYear : a.kind === "supplyLimited" ? -1 : 1));
  const top = candidates.slice(0, PLAN_MAX_ITEMS);
  const names = top.length
    ? await prisma.facility.findMany({ where: { id: { in: [...new Set(top.map((c) => c.facilityId))] } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map<string, string>((names as { id: string; name: string }[]).map((f): [string, string] => [f.id, f.name]));

  return {
    firstDate,
    latestDate: latest,
    completeMonths: idx?.completeMonths ?? complete.length,
    method: idx?.method ?? null,
    index: indexByMonth,
    availability,
    seasons,
    planMonths: targets.map((tg, i) => {
      const ix = indexByMonth[tg.month]?.index ?? null;
      return { year: tg.year, month: tg.month, index: ix, level: ix === null ? null : levelOf(ix), counts: counts[i] };
    }),
    planItems: top.map((c) => ({ ...c, facilityName: nameById.get(c.facilityId) ?? "" })),
  };
}

const getSeasonPlanCached = cached("getSeasonPlan", getSeasonPlanImpl);

export function getSeasonPlan(filters: FilterArgs): Promise<SeasonPlanData | null> {
  // `today` va como argumento para que sea parte de la clave del caché (el plan cambia al pasar el mes).
  return getSeasonPlanCached(filters, todayISO());
}
