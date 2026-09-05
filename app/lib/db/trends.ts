import { GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, DAY_ORDER, DAY_LABEL_ES, sortHoursByOperatingDay, type OverviewFilters } from "./shared";
import { inferFormat } from "./format";

export type TrendBucket = "week" | "month" | "quarter" | "semester" | "year";

export type MetricSeriesPoint = {
  bucket: string;
  label: string;
  totalGames: number;
  confirmedGames: number;
  cancelledGames: number;
  confirmationRate: number;
  cancellationRate: number;
  occupancyRate: number;
  conversionRate: number;
};

// Fila con la misma forma para las 3 dimensiones de cruce (día, horario,
// formato) — así el frontend las trata todas igual, sin casos especiales.
export type PatternRow = {
  key: string;
  label: string;
  totalGames: number;
  confirmedGames: number;
  cancelledGames: number;
  confirmationRate: number;
  cancellationRate: number;
  occupancyRate: number;
  conversionRate: number;
};

// "Conversión" tal como la definimos: no tenemos ID de jugador, así que no
// podemos seguir a una persona puntual de "se anota" a "no cancela" a
// "el partido se confirma". Este es el proxy más honesto que se puede armar
// con datos a nivel partido: de todos los "slots de jugador" que llegaron a
// interactuar con partidos de este filtro (los que terminaron jugando + los
// que abandonaron + los que quedaron en lista de espera sin entrar), qué
// fracción efectivamente llegó a jugar. Ponderado por volumen (suma sobre
// suma), no promedio de razones por partido — mismo criterio que ocupación.
function computeConversionRate(sumFinal: number, sumDropped: number): number {
  const totalInvolved = sumFinal + sumDropped;
  return totalInvolved > 0 ? sumFinal / totalInvolved : 0;
}

function startOfWeekUTC(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function bucketKeyAndLabel(date: Date, bucket: TrendBucket): { key: string; label: string } {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();

  if (bucket === "year") return { key: `${y}`, label: `${y}` };

  if (bucket === "semester") {
    const h = m < 6 ? 1 : 2;
    return { key: `${y}-S${h}`, label: `S${h} ${y}` };
  }

  if (bucket === "quarter") {
    const q = Math.floor(m / 3) + 1;
    return { key: `${y}-Q${q}`, label: `T${q} ${y}` };
  }

  if (bucket === "month") {
    const label = new Date(Date.UTC(y, m, 1)).toLocaleDateString("es-AR", { month: "short", year: "2-digit", timeZone: "UTC" });
    return { key: `${y}-${String(m + 1).padStart(2, "0")}`, label };
  }

  // week
  const weekStart = startOfWeekUTC(date);
  const key = weekStart.toISOString().slice(0, 10);
  const label = weekStart.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return { key, label };
}

// Ventana por defecto según la granularidad elegida — suficientes buckets
// para que la tendencia/proyección tengan sentido estadístico, sin traer
// más historial del que hace falta.
function defaultWindowStart(bucket: TrendBucket, end: Date): Date {
  const start = new Date(end);
  if (bucket === "week") start.setUTCDate(start.getUTCDate() - 7 * 26); // ~26 semanas
  else if (bucket === "month") start.setUTCMonth(start.getUTCMonth() - 24); // 24 meses
  else if (bucket === "quarter") start.setUTCMonth(start.getUTCMonth() - 24); // 8 trimestres
  else if (bucket === "semester") start.setUTCMonth(start.getUTCMonth() - 36); // 6 semestres
  else start.setUTCFullYear(start.getUTCFullYear() - 5); // hasta 5 años
  return start;
}

type SeriesRow = { date: Date; status: "CONFIRMED" | "CANCELLED"; finalPlayers: number; maxPlayers: number; droppedPlayers: number; waitlistPlayers: number };

function buildSeriesFromGames(games: SeriesRow[], bucket: TrendBucket): MetricSeriesPoint[] {
  const map = new Map<string, { label: string; confirmed: number; cancelled: number; sumFinal: number; sumMax: number; sumDropped: number; sumWaitlist: number }>();
  for (const g of games) {
    const { key, label } = bucketKeyAndLabel(g.date, bucket);
    const entry = map.get(key) ?? { label, confirmed: 0, cancelled: 0, sumFinal: 0, sumMax: 0, sumDropped: 0, sumWaitlist: 0 };
    if (g.status === "CONFIRMED") {
      entry.confirmed += 1;
      entry.sumFinal += g.finalPlayers;
      entry.sumMax += g.maxPlayers;
    } else {
      entry.cancelled += 1;
    }
    entry.sumDropped += g.droppedPlayers ?? 0;
    entry.sumWaitlist += g.waitlistPlayers ?? 0;
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => {
      const total = v.confirmed + v.cancelled;
      return {
        bucket: key,
        label: v.label,
        totalGames: total,
        confirmedGames: v.confirmed,
        cancelledGames: v.cancelled,
        confirmationRate: total > 0 ? v.confirmed / total : 0,
        cancellationRate: total > 0 ? v.cancelled / total : 0,
        occupancyRate: v.sumMax > 0 ? v.sumFinal / v.sumMax : 0,
        conversionRate: computeConversionRate(v.sumFinal, v.sumDropped),
      };
    });
}

async function getMetricSeriesImpl(filters: OverviewFilters, bucket: TrendBucket): Promise<MetricSeriesPoint[]> {
  const now = new Date();
  const windowStart = defaultWindowStart(bucket, now);
  const where = buildWhere({ ...filters, dateFrom: windowStart, dateTo: now });

  // Necesita fila por fila: el bucket (semana/trimestre/semestre) no es algo
  // que Prisma pueda agrupar por nosotros sin SQL crudo — pero traemos solo
  // las columnas que hacen falta.
  const games = (await prisma.game.findMany({
    where,
    select: { date: true, status: true, finalPlayers: true, maxPlayers: true, droppedPlayers: true, waitlistPlayers: true },
  })) as SeriesRow[];

  return buildSeriesFromGames(games, bucket);
}

// Variante acotada a una ventana exacta (no la ventana "por defecto" hacia
// atrás) — usada por la vista consolidada de Trends, donde el período lo
// define el selector Año/Semestre/Trimestre/Mes, no un lookback fijo.
async function getMetricSeriesInWindowImpl(
  filters: OverviewFilters,
  bucket: TrendBucket,
  windowStart: Date,
  windowEnd: Date
): Promise<MetricSeriesPoint[]> {
  const where = buildWhere({ ...filters, dateFrom: windowStart, dateTo: windowEnd });
  const games = (await prisma.game.findMany({
    where,
    select: { date: true, status: true, finalPlayers: true, maxPlayers: true, droppedPlayers: true, waitlistPlayers: true },
  })) as SeriesRow[];

  return buildSeriesFromGames(games, bucket);
}

export const getMetricSeries = cached("getMetricSeries", getMetricSeriesImpl);
export const getMetricSeriesInWindow = cached("getMetricSeriesInWindow", getMetricSeriesInWindowImpl);

// ---------- Patrón por día de la semana (vía groupBy: dayOfWeek es columna real) ----------

async function getDayOfWeekPatternImpl(filters: OverviewFilters): Promise<PatternRow[]> {
  const where = buildWhere(filters);
  const confirmedWhere = { ...where, status: GameStatus.CONFIRMED };
  const cancelledWhere = { ...where, status: GameStatus.CANCELLED };

  const [totals, cancelledGroups, occupancyGroups, engagementGroups] = await Promise.all([
    prisma.game.groupBy({ by: ["dayOfWeek"], where, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["dayOfWeek"], where: cancelledWhere, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["dayOfWeek"], where: confirmedWhere, _sum: { finalPlayers: true, maxPlayers: true } }),
    prisma.game.groupBy({ by: ["dayOfWeek"], where, _sum: { droppedPlayers: true, waitlistPlayers: true } }),
  ]);

  const cancelledMap = new Map<string, number>(cancelledGroups.map((c) => [c.dayOfWeek, Number(c._count._all)]));
  const occMap = new Map<string, { final: number; max: number }>(
    occupancyGroups.map((o) => [o.dayOfWeek, { final: o._sum.finalPlayers ?? 0, max: o._sum.maxPlayers ?? 0 }])
  );
  const engagementMap = new Map<string, { dropped: number; waitlist: number }>(
    engagementGroups.map((e) => [e.dayOfWeek, { dropped: e._sum.droppedPlayers ?? 0, waitlist: e._sum.waitlistPlayers ?? 0 }])
  );

  const rows: PatternRow[] = totals.map((t) => {
    const total = Number(t._count._all);
    const cancelledCount = cancelledMap.get(t.dayOfWeek) ?? 0;
    const occ = occMap.get(t.dayOfWeek) ?? { final: 0, max: 0 };
    const eng = engagementMap.get(t.dayOfWeek) ?? { dropped: 0, waitlist: 0 };
    return {
      key: t.dayOfWeek,
      label: DAY_LABEL_ES[t.dayOfWeek] ?? t.dayOfWeek,
      totalGames: total,
      confirmedGames: total - cancelledCount,
      cancelledGames: cancelledCount,
      confirmationRate: total > 0 ? (total - cancelledCount) / total : 0,
      cancellationRate: total > 0 ? cancelledCount / total : 0,
      occupancyRate: occ.max > 0 ? occ.final / occ.max : 0,
      conversionRate: computeConversionRate(occ.final, eng.dropped),
    };
  });

  // Orden Lunes -> Domingo, no alfabético
  return DAY_ORDER.map((d) => rows.find((r) => r.key === d)).filter((r): r is PatternRow => !!r);
}

export const getDayOfWeekPattern = cached("getDayOfWeekPattern", getDayOfWeekPatternImpl);

// ---------- Patrón por horario (fila por fila: la hora sale de un substring) ----------

type HourRow = { time: string; status: "CONFIRMED" | "CANCELLED"; finalPlayers: number; maxPlayers: number; droppedPlayers: number; waitlistPlayers: number };

async function getHourPatternImpl(filters: OverviewFilters): Promise<PatternRow[]> {
  const where = buildWhere(filters);
  const games = (await prisma.game.findMany({
    where,
    select: { time: true, status: true, finalPlayers: true, maxPlayers: true, droppedPlayers: true, waitlistPlayers: true },
  })) as HourRow[];

  const map = new Map<string, { confirmed: number; cancelled: number; sumFinal: number; sumMax: number; sumDropped: number; sumWaitlist: number }>();
  for (const g of games) {
    const hour = g.time?.slice(0, 2);
    if (!hour) continue;
    const entry = map.get(hour) ?? { confirmed: 0, cancelled: 0, sumFinal: 0, sumMax: 0, sumDropped: 0, sumWaitlist: 0 };
    if (g.status === "CONFIRMED") {
      entry.confirmed += 1;
      entry.sumFinal += g.finalPlayers;
      entry.sumMax += g.maxPlayers;
    } else {
      entry.cancelled += 1;
    }
    entry.sumDropped += g.droppedPlayers ?? 0;
    entry.sumWaitlist += g.waitlistPlayers ?? 0;
    map.set(hour, entry);
  }

  return sortHoursByOperatingDay(Array.from(map.keys())).map((hour) => {
    const v = map.get(hour)!;
    const total = v.confirmed + v.cancelled;
    return {
      key: hour,
      label: `${hour}h`,
      totalGames: total,
      confirmedGames: v.confirmed,
      cancelledGames: v.cancelled,
      confirmationRate: total > 0 ? v.confirmed / total : 0,
      cancellationRate: total > 0 ? v.cancelled / total : 0,
      occupancyRate: v.sumMax > 0 ? v.sumFinal / v.sumMax : 0,
      conversionRate: computeConversionRate(v.sumFinal, v.sumDropped),
    };
  });
}

export const getHourPattern = cached("getHourPattern", getHourPatternImpl);

// ---------- Patrón por formato (reusa el motor de inferencia de format.ts) ----------
// Como el formato depende solo de Max Players (ya no se ancla a la facility),
// se puede agregar directo con groupBy en Postgres — no hace falta traer
// partido por partido como antes.

async function getFormatPatternImpl(filters: OverviewFilters): Promise<PatternRow[]> {
  const where = buildWhere(filters);
  const confirmedWhere = { ...where, status: GameStatus.CONFIRMED };
  const cancelledWhere = { ...where, status: GameStatus.CANCELLED };

  const [totals, cancelledGroups, occupancyGroups, engagementGroups] = await Promise.all([
    prisma.game.groupBy({ by: ["maxPlayers"], where, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["maxPlayers"], where: cancelledWhere, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["maxPlayers"], where: confirmedWhere, _sum: { finalPlayers: true, maxPlayers: true } }),
    prisma.game.groupBy({ by: ["maxPlayers"], where, _sum: { finalPlayers: true, droppedPlayers: true } }),
  ]);

  const cancelledMap = new Map<number, number>(cancelledGroups.map((g) => [g.maxPlayers, Number(g._count._all)]));
  const occMap = new Map<number, { final: number; max: number }>(
    occupancyGroups.map((g) => [g.maxPlayers, { final: g._sum.finalPlayers ?? 0, max: g._sum.maxPlayers ?? 0 }])
  );
  const engMap = new Map<number, { final: number; dropped: number }>(
    engagementGroups.map((g) => [g.maxPlayers, { final: g._sum.finalPlayers ?? 0, dropped: g._sum.droppedPlayers ?? 0 }])
  );

  const map = new Map<string, { confirmed: number; cancelled: number; sumFinal: number; sumMax: number; sumDropped: number }>();
  for (const t of totals) {
    const label = inferFormat(t.maxPlayers).label;
    const total = Number(t._count._all);
    const cancelled = cancelledMap.get(t.maxPlayers) ?? 0;
    const occ = occMap.get(t.maxPlayers) ?? { final: 0, max: 0 };
    const eng = engMap.get(t.maxPlayers) ?? { final: 0, dropped: 0 };
    const entry = map.get(label) ?? { confirmed: 0, cancelled: 0, sumFinal: 0, sumMax: 0, sumDropped: 0 };
    entry.confirmed += total - cancelled;
    entry.cancelled += cancelled;
    entry.sumFinal += occ.final;
    entry.sumMax += occ.max;
    entry.sumDropped += eng.dropped;
    map.set(label, entry);
  }

  return Array.from(map.entries())
    .map(([label, v]) => {
      const total = v.confirmed + v.cancelled;
      return {
        key: label,
        label,
        totalGames: total,
        confirmedGames: v.confirmed,
        cancelledGames: v.cancelled,
        confirmationRate: total > 0 ? v.confirmed / total : 0,
        cancellationRate: total > 0 ? v.cancelled / total : 0,
        occupancyRate: v.sumMax > 0 ? v.sumFinal / v.sumMax : 0,
        conversionRate: computeConversionRate(v.sumFinal, v.sumDropped),
      };
    })
    .sort((a, b) => b.totalGames - a.totalGames);
}

export const getFormatPattern = cached("getFormatPattern", getFormatPatternImpl);

// ---------- Consistencia de horarios (día×hora, por mes, con comparación interanual) ----------
//
// Con mode="confirmed" responde "¿qué partidos no pueden faltar?": para cada
// combinación día+hora, en cuántos de los últimos meses observados hubo al
// menos un partido CONFIRMADO. Con mode="cancelled" responde lo opuesto:
// "¿qué partidos remover o evitar agendar?" — la misma lógica, pero contando
// meses con al menos un partido CANCELADO en ese slot. Pensado para usarse
// con un filtro de facility puntual — a nivel red mezcla canchas muy
// distintas entre sí.

export type SlotConsistencyMode = "confirmed" | "cancelled";

export type SlotConsistencyCell = {
  day: string;
  dayLabel: string;
  hour: string;
  consistencyPct: number; // % de los meses observados con al menos 1 partido del status elegido en ese slot
  monthsPresent: number;
  totalMonthsObserved: number;
  selectedMonthCount: number; // partidos del status elegido en el mes seleccionado
  priorYearCount: number; // ídem, mismo mes, año anterior
  priorMonthCount: number; // ídem, mes calendario inmediatamente anterior
};

type SlotRow = { date: Date; dayOfWeek: string; time: string; status: "CONFIRMED" | "CANCELLED" };

function shiftYearMonth(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function getSlotConsistencyImpl(filters: OverviewFilters, selectedMonth: string /* "YYYY-MM" */, mode: SlotConsistencyMode = "confirmed") {
  // Todo el histórico disponible (no el filtro de tiempo activo): la
  // consistencia se mide contra el comportamiento completo, no un recorte.
  const where = buildWhere(filters);
  const games = (await prisma.game.findMany({
    where,
    select: { date: true, dayOfWeek: true, time: true, status: true },
  })) as SlotRow[];

  const targetStatus = mode === "confirmed" ? "CONFIRMED" : "CANCELLED";

  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const priorYearMonth = `${selYear - 1}-${String(selMonthNum).padStart(2, "0")}`;
  const priorMonth = shiftYearMonth(selectedMonth, -1);

  const slotMonths = new Map<string, Set<string>>(); // "day|hour" -> meses con >=1 partido del status elegido
  const allMonths = new Set<string>();
  const selectedCounts = new Map<string, number>();
  const priorYearCounts = new Map<string, number>();
  const priorMonthCounts = new Map<string, number>();
  const hoursSet = new Set<string>();

  for (const g of games) {
    const hour = g.time?.slice(0, 2);
    const day = g.dayOfWeek;
    if (!hour || !day) continue;
    hoursSet.add(hour);
    if (g.status !== targetStatus) continue;

    const monthKey = `${g.date.getUTCFullYear()}-${String(g.date.getUTCMonth() + 1).padStart(2, "0")}`;
    allMonths.add(monthKey);
    const slotKey = `${day}|${hour}`;

    const set = slotMonths.get(slotKey) ?? new Set<string>();
    set.add(monthKey);
    slotMonths.set(slotKey, set);

    if (monthKey === selectedMonth) selectedCounts.set(slotKey, (selectedCounts.get(slotKey) ?? 0) + 1);
    if (monthKey === priorYearMonth) priorYearCounts.set(slotKey, (priorYearCounts.get(slotKey) ?? 0) + 1);
    if (monthKey === priorMonth) priorMonthCounts.set(slotKey, (priorMonthCounts.get(slotKey) ?? 0) + 1);
  }

  const totalMonthsObserved = allMonths.size;
  const hours = sortHoursByOperatingDay(Array.from(hoursSet));

  const cells: SlotConsistencyCell[] = [];
  for (const day of DAY_ORDER) {
    for (const hour of hours) {
      const slotKey = `${day}|${hour}`;
      const monthsPresent = slotMonths.get(slotKey)?.size ?? 0;
      cells.push({
        day,
        dayLabel: DAY_LABEL_ES[day] ?? day,
        hour: `${hour}h`,
        consistencyPct: totalMonthsObserved > 0 ? monthsPresent / totalMonthsObserved : 0,
        monthsPresent,
        totalMonthsObserved,
        selectedMonthCount: selectedCounts.get(slotKey) ?? 0,
        priorYearCount: priorYearCounts.get(slotKey) ?? 0,
        priorMonthCount: priorMonthCounts.get(slotKey) ?? 0,
      });
    }
  }

  const insights = generateSlotInsights(cells, priorMonth, mode);

  return {
    days: DAY_ORDER.map((d) => DAY_LABEL_ES[d] ?? d),
    hours: hours.map((h) => `${h}h`),
    cells,
    selectedMonth,
    priorYearMonth,
    priorMonth,
    totalMonthsObserved,
    insights,
  };
}

// Insights fuera del heatmap: "¿qué slot se está cayendo?" y "¿qué slot
// podría estar volviéndose confiable (o problemático)?" — ambos basados en
// el movimiento mes a mes, no solo en la foto del mes seleccionado.
const ESTABLISHED_THRESHOLD = 0.5; // slot ya considerado "habitual"
const MIN_DROP = 2; // partidos de diferencia mínimos para que valga destacarlo

function generateSlotInsights(cells: SlotConsistencyCell[], priorMonthLabel: string, mode: SlotConsistencyMode): string[] {
  const insights: string[] = [];
  const noun = mode === "confirmed" ? "confirmados" : "cancelados";

  const declining = [...cells]
    .filter((c) => c.consistencyPct >= ESTABLISHED_THRESHOLD && c.priorMonthCount - c.selectedMonthCount >= MIN_DROP)
    .sort((a, b) => (b.priorMonthCount - b.selectedMonthCount) - (a.priorMonthCount - a.selectedMonthCount))[0];
  if (declining) {
    const verb = mode === "confirmed" ? "vale la pena revisar qué cambió" : "buena señal, pero vale la pena confirmar que no sea una casualidad del mes";
    insights.push(
      `⚠ ${declining.dayLabel} ${declining.hour} venía siendo un slot consistente (${(declining.consistencyPct * 100).toFixed(0)}% de los meses con ${noun}), pero cayó de ${declining.priorMonthCount} a ${declining.selectedMonthCount} partidos ${noun} respecto a ${priorMonthLabel} — ${verb}.`
    );
  }

  const emerging = [...cells]
    .filter((c) => c.consistencyPct < ESTABLISHED_THRESHOLD && c.selectedMonthCount > 0 && c.priorMonthCount > 0)
    .sort((a, b) => b.selectedMonthCount + b.priorMonthCount - (a.selectedMonthCount + a.priorMonthCount))[0];
  if (emerging) {
    const tail = mode === "confirmed"
      ? "podría estar convirtiéndose en un horario estable, vale la pena seguirlo"
      : "podría estar convirtiéndose en un horario problemático, vale la pena revisarlo antes de que se consolide";
    insights.push(
      `↗ ${emerging.dayLabel} ${emerging.hour} tuvo partidos ${noun} dos meses seguidos, pese a no ser todavía un slot consistente históricamente (${(emerging.consistencyPct * 100).toFixed(0)}%) — ${tail}.`
    );
  }

  if (insights.length === 0) {
    insights.push(`Sin cambios destacables en los slots ${mode === "confirmed" ? "confiables" : "problemáticos"} este mes respecto al anterior.`);
  }

  return insights;
}

export const getSlotConsistency = cached("getSlotConsistency", getSlotConsistencyImpl);

// ---------- Performance reciente por slot (últimas N semanas) ----------
// Complementa la consistencia histórica (mensual, multi-mes) con una mirada
// más corta: ¿cómo viene funcionando este slot en las últimas 8 semanas?
// Sirve para detectar demanda emergente que todavía no acumuló suficientes
// meses como para aparecer "consistente" en el heatmap principal.

export type SlotRecentRow = { day: string; dayLabel: string; hour: string; confirmationRate: number; totalGames: number };

async function getSlotRecentPerformanceImpl(filters: OverviewFilters, weeks = 8): Promise<SlotRecentRow[]> {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - weeks * 7);

  const where = buildWhere({ ...filters, dateFrom: windowStart, dateTo: now });
  const games = (await prisma.game.findMany({ where, select: { dayOfWeek: true, time: true, status: true } })) as { dayOfWeek: string; time: string; status: "CONFIRMED" | "CANCELLED" }[];

  const map = new Map<string, { confirmed: number; total: number }>();
  for (const g of games) {
    const hour = g.time?.slice(0, 2);
    if (!hour || !g.dayOfWeek) continue;
    const key = `${g.dayOfWeek}|${hour}`;
    const entry = map.get(key) ?? { confirmed: 0, total: 0 };
    entry.total += 1;
    if (g.status === "CONFIRMED") entry.confirmed += 1;
    map.set(key, entry);
  }

  return Array.from(map.entries()).map(([key, v]) => {
    const [day, hour] = key.split("|");
    return {
      day,
      dayLabel: DAY_LABEL_ES[day] ?? day,
      hour: `${hour}h`,
      confirmationRate: v.total > 0 ? v.confirmed / v.total : 0,
      totalGames: v.total,
    };
  });
}

export const getSlotRecentPerformance = cached("getSlotRecentPerformance", getSlotRecentPerformanceImpl);

// ---------- Patrón estacional: 6 variables por mes calendario (multi-año) ----------
//
// A diferencia de la serie temporal (que sigue el calendario real, año tras
// año), esto agrega TODOS los años juntos por mes calendario — "¿enero
// siempre es más flojo, sin importar el año?". Las 6 variables tienen
// unidades completamente distintas (tasas 0-100%, gente en espera, minutos
// de lead time), así que además de los valores reales, devolvemos una
// versión normalizada 0-100 (relativa al propio máximo de cada variable)
// para poder graficarlas juntas y comparar CUÁNDO pican, no cuánto pican.

const MONTH_LABELS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export type SeasonalMonthPoint = {
  month: number;
  monthLabel: string;
  confirmationRate: number;
  cancellationRate: number;
  occupancyRate: number;
  avgWaitlist: number;
  medianLeadTime: number | null;
  conversionRate: number;
};

export type SeasonalNormalizedPoint = {
  month: number;
  monthLabel: string;
  confirmationIndex: number;
  cancellationIndex: number;
  occupancyIndex: number;
  waitlistIndex: number;
  leadTimeIndex: number;
  conversionIndex: number;
};

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

type SeasonalRow = {
  date: Date;
  status: "CONFIRMED" | "CANCELLED";
  finalPlayers: number;
  maxPlayers: number;
  droppedPlayers: number;
  waitlistPlayers: number;
  confirmationLeadTime: number | null;
};

async function getSeasonalPatternImpl(filters: OverviewFilters): Promise<{ points: SeasonalMonthPoint[]; normalized: SeasonalNormalizedPoint[] }> {
  // Todo el histórico disponible (no el filtro de tiempo activo): el patrón
  // estacional necesita varios años para decir algo confiable.
  const where = buildWhere(filters);
  const games = (await prisma.game.findMany({
    where,
    select: {
      date: true, status: true, finalPlayers: true, maxPlayers: true,
      droppedPlayers: true, waitlistPlayers: true, confirmationLeadTime: true,
    },
  })) as SeasonalRow[];

  type Bucket = { confirmed: number; cancelled: number; sumFinal: number; sumMax: number; sumDropped: number; sumWaitlist: number; gameCount: number; leadTimes: number[] };
  const buckets = new Map<number, Bucket>();
  for (let m = 1; m <= 12; m++) buckets.set(m, { confirmed: 0, cancelled: 0, sumFinal: 0, sumMax: 0, sumDropped: 0, sumWaitlist: 0, gameCount: 0, leadTimes: [] });

  for (const g of games) {
    const m = g.date.getUTCMonth() + 1;
    const b = buckets.get(m)!;
    if (g.status === "CONFIRMED") {
      b.confirmed += 1;
      b.sumFinal += g.finalPlayers;
      b.sumMax += g.maxPlayers;
    } else {
      b.cancelled += 1;
    }
    b.sumDropped += g.droppedPlayers ?? 0;
    b.sumWaitlist += g.waitlistPlayers ?? 0;
    b.gameCount += 1;
    if (g.confirmationLeadTime != null) b.leadTimes.push(g.confirmationLeadTime);
  }

  const points: SeasonalMonthPoint[] = [];
  for (let m = 1; m <= 12; m++) {
    const b = buckets.get(m)!;
    const total = b.confirmed + b.cancelled;
    points.push({
      month: m,
      monthLabel: MONTH_LABELS_SHORT[m - 1],
      confirmationRate: total > 0 ? b.confirmed / total : 0,
      cancellationRate: total > 0 ? b.cancelled / total : 0,
      occupancyRate: b.sumMax > 0 ? b.sumFinal / b.sumMax : 0,
      avgWaitlist: b.gameCount > 0 ? b.sumWaitlist / b.gameCount : 0,
      medianLeadTime: medianOf(b.leadTimes),
      conversionRate: computeConversionRate(b.sumFinal, b.sumDropped),
    });
  }

  function normalizeSeries(values: number[]): number[] {
    const max = Math.max(...values, 0.0001);
    return values.map((v) => Math.round((v / max) * 1000) / 10);
  }
  const confirmationIdx = normalizeSeries(points.map((p) => p.confirmationRate));
  const cancellationIdx = normalizeSeries(points.map((p) => p.cancellationRate));
  const occupancyIdx = normalizeSeries(points.map((p) => p.occupancyRate));
  const waitlistIdx = normalizeSeries(points.map((p) => p.avgWaitlist));
  const leadTimeIdx = normalizeSeries(points.map((p) => p.medianLeadTime ?? 0));
  const conversionIdx = normalizeSeries(points.map((p) => p.conversionRate));

  const normalized: SeasonalNormalizedPoint[] = points.map((p, i) => ({
    month: p.month,
    monthLabel: p.monthLabel,
    confirmationIndex: confirmationIdx[i],
    cancellationIndex: cancellationIdx[i],
    occupancyIndex: occupancyIdx[i],
    waitlistIndex: waitlistIdx[i],
    leadTimeIndex: leadTimeIdx[i],
    conversionIndex: conversionIdx[i],
  }));

  return { points, normalized };
}

export const getSeasonalPattern = cached("getSeasonalPattern", getSeasonalPatternImpl);

// ---------- Patrón mensual reciente: 6 variables, últimos 12 meses reales ----------
// A diferencia de getSeasonalPattern (agrega TODOS los años por mes calendario,
// para ver el patrón que se repite), esto sigue el calendario real de los
// últimos 12 meses — la evolución reciente de cada variable, por separado.

export type RecentMonthPoint = {
  monthKey: string; // "YYYY-MM" o "YYYY-Www" según la unidad
  monthLabel: string;
  confirmationRate: number;
  cancellationRate: number;
  occupancyRate: number;
  avgWaitlist: number;
  medianLeadTime: number | null;
  conversionRate: number;
  hasData: boolean; // false = bucket futuro o sin partidos todavía, para no confundir "0%" con "sin datos"
};

function mondayOf(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // Lunes=0
  const m = new Date(d);
  m.setUTCDate(m.getUTCDate() - day);
  m.setUTCHours(0, 0, 0, 0);
  return m;
}

// Enumera TODOS los buckets entre windowStart y windowEnd (incluso los que
// todavía no tienen datos porque son futuros dentro del período elegido) —
// así el eje del gráfico siempre llega hasta el final real del período
// (ej: hasta diciembre si se eligió "Semestre", aunque solo julio-septiembre
// tengan datos todavía).
function enumerateBuckets(windowStart: Date, windowEnd: Date, unit: "month" | "week"): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];
  if (unit === "month") {
    const cursor = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), 1));
    const end = new Date(Date.UTC(windowEnd.getUTCFullYear(), windowEnd.getUTCMonth(), 1));
    while (cursor <= end) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
      const label = cursor.toLocaleDateString("es-AR", { month: "short", timeZone: "UTC" });
      buckets.push({ key, label });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    const cursor = mondayOf(windowStart);
    const end = windowEnd;
    let weekNum = 1;
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      const label = `Sem ${weekNum}`;
      buckets.push({ key, label });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
      weekNum += 1;
    }
  }
  return buckets;
}

async function getSeasonalWindowPatternImpl(
  filters: OverviewFilters,
  windowStart: Date,
  windowEnd: Date,
  bucketUnit: "month" | "week"
): Promise<RecentMonthPoint[]> {
  const now = new Date();
  const dataEnd = windowEnd < now ? windowEnd : now;

  const where = buildWhere({ ...filters, dateFrom: windowStart, dateTo: dataEnd });
  const games =
    dataEnd >= windowStart
      ? ((await prisma.game.findMany({
          where,
          select: {
            date: true, status: true, finalPlayers: true, maxPlayers: true,
            droppedPlayers: true, waitlistPlayers: true, confirmationLeadTime: true,
          },
        })) as SeasonalRow[])
      : [];

  type Bucket = { confirmed: number; cancelled: number; sumFinal: number; sumMax: number; sumDropped: number; sumWaitlist: number; gameCount: number; leadTimes: number[] };
  const buckets = new Map<string, Bucket>();

  for (const g of games) {
    const key =
      bucketUnit === "month"
        ? `${g.date.getUTCFullYear()}-${String(g.date.getUTCMonth() + 1).padStart(2, "0")}`
        : mondayOf(g.date).toISOString().slice(0, 10);
    const b = buckets.get(key) ?? { confirmed: 0, cancelled: 0, sumFinal: 0, sumMax: 0, sumDropped: 0, sumWaitlist: 0, gameCount: 0, leadTimes: [] };
    if (g.status === "CONFIRMED") {
      b.confirmed += 1;
      b.sumFinal += g.finalPlayers;
      b.sumMax += g.maxPlayers;
    } else {
      b.cancelled += 1;
    }
    b.sumDropped += g.droppedPlayers ?? 0;
    b.sumWaitlist += g.waitlistPlayers ?? 0;
    b.gameCount += 1;
    if (g.confirmationLeadTime != null) b.leadTimes.push(g.confirmationLeadTime);
    buckets.set(key, b);
  }

  const allBuckets = enumerateBuckets(windowStart, windowEnd, bucketUnit);

  return allBuckets.map(({ key, label }) => {
    const b = buckets.get(key);
    if (!b) {
      return {
        monthKey: key, monthLabel: label, confirmationRate: 0, cancellationRate: 0,
        occupancyRate: 0, avgWaitlist: 0, medianLeadTime: null, conversionRate: 0, hasData: false,
      };
    }
    const total = b.confirmed + b.cancelled;
    return {
      monthKey: key,
      monthLabel: label,
      confirmationRate: total > 0 ? b.confirmed / total : 0,
      cancellationRate: total > 0 ? b.cancelled / total : 0,
      occupancyRate: b.sumMax > 0 ? b.sumFinal / b.sumMax : 0,
      avgWaitlist: b.gameCount > 0 ? b.sumWaitlist / b.gameCount : 0,
      medianLeadTime: medianOf(b.leadTimes),
      conversionRate: computeConversionRate(b.sumFinal, b.sumDropped),
      hasData: total > 0,
    };
  });
}

export const getSeasonalWindowPattern = cached("getSeasonalWindowPattern", getSeasonalWindowPatternImpl);

// ---------- Resumen "clima" por trimestre del año (multi-año, para referencia estática) ----------
// Agrega los 4 trimestres calendario (no fijos a un año particular) usando
// todo el histórico — pensado como referencia rápida y siempre visible,
// para contrastar contra lo que se esté mirando en el resto de la página.

export type QuarterClimatePoint = { quarter: number; label: string; confirmationRate: number; totalGames: number };

async function getQuarterClimateImpl(filters: OverviewFilters): Promise<QuarterClimatePoint[]> {
  const where = buildWhere(filters);
  const games = (await prisma.game.findMany({ where, select: { date: true, status: true } })) as { date: Date; status: "CONFIRMED" | "CANCELLED" }[];

  const buckets = new Map<number, { confirmed: number; total: number }>();
  for (let q = 1; q <= 4; q++) buckets.set(q, { confirmed: 0, total: 0 });

  for (const g of games) {
    const q = Math.floor(g.date.getUTCMonth() / 3) + 1;
    const b = buckets.get(q)!;
    b.total += 1;
    if (g.status === "CONFIRMED") b.confirmed += 1;
  }

  return [1, 2, 3, 4].map((q) => {
    const b = buckets.get(q)!;
    return { quarter: q, label: `T${q}`, confirmationRate: b.total > 0 ? b.confirmed / b.total : 0, totalGames: b.total };
  });
}

export const getQuarterClimate = cached("getQuarterClimate", getQuarterClimateImpl);
