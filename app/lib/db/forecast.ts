import { prisma } from "./prisma";
import { cached } from "./cache";
import { withDemandOnly } from "../metrics";
import { buildWhere, average, stdDev, linearRegression, type OverviewFilters } from "./shared";

// ---------- Pronóstico de red: próxima semana / próximo mes ----------
// Complemento de getDailyForecast (día por día, por facility): esto agrega
// TODA la red — o la región/market/facility que esté filtrada, mismo patrón
// de filtro que Overview/Market/Trends — en un solo número por métrica, para
// una ventana más larga (7 o 30 días desde hoy). Mismo método de fondo que
// Daily (regresión lineal sobre bloques históricos comparables), pero
// agregando PRIMERO y regresionando una sola vez sobre la serie ya agregada
// — nunca promediando N regresiones por facility, que sería más pesado y
// más ruidoso con series cortas.
//
// "Semana"/"mes" acá son ventanas RODANTES desde hoy (próximos 7 / 30 días),
// no el mes calendario en curso — ese ya lo cubre getMonthProjection
// (regla de 3 sobre el mes actual). Esto es un pronóstico genuino de un
// período que todavía no empezó, no una extrapolación del que está a mitad
// de camino.

function parseISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
function addDaysUTC(d: Date, delta: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + delta);
  return r;
}

export type ForecastRange = "week" | "month";
export type ForecastMethod = "regression" | "average" | "insufficient";

const RANGE_DAYS: Record<ForecastRange, number> = { week: 7, month: 30 };
// Exportados: app/forecast/page.tsx los necesita para el texto del
// disclaimer y del estado "sin historial suficiente" — un solo número
// fuente de verdad, mismo criterio que MIN_OCCURRENCES_FOR_PREDICTION
// en daily.ts.
export const LOOKBACK_BLOCKS = 12;
export const MIN_BLOCKS_FOR_PREDICTION = 3;
const MIN_BLOCKS_FOR_TREND = 5;

export type ForecastMetric = {
  predicted: number | null;
  low: number | null; // banda baja: predicted - 1 desvío estándar de los bloques históricos, clampeada al dominio válido
  high: number | null; // banda alta
  avg: number | null; // promedio simple de esos mismos bloques, como referencia
};

function buildMetric(historicalValues: number[], n: number, method: ForecastMethod, clamp: [number, number] | null): ForecastMetric {
  if (method === "insufficient" || historicalValues.length === 0) {
    return { predicted: null, low: null, high: null, avg: null };
  }
  const avg = average(historicalValues);
  const sd = stdDev(historicalValues);

  let predicted: number;
  if (method === "regression") {
    const xs = historicalValues.map((_, idx) => idx);
    const { slope, intercept } = linearRegression(xs, historicalValues);
    predicted = slope * n + intercept;
  } else {
    predicted = avg;
  }

  const clampFn = (v: number) => (clamp ? Math.min(clamp[1], Math.max(clamp[0], v)) : Math.max(0, v));
  const low = clampFn(predicted - sd);
  const high = clampFn(predicted + sd);
  return { predicted: clampFn(predicted), low, high, avg };
}

type BlockTotals = {
  totalGames: number; // publicados (volumen de oferta)
  demandBase: number; // confirmados + cancelados por demanda: denominador de la tasa de demanda
  confirmedGames: number;
  sumFinalConfirmed: number;
  sumMaxConfirmed: number;
  revenue: number;
};

function emptyBlock(): BlockTotals {
  return { totalGames: 0, demandBase: 0, confirmedGames: 0, sumFinalConfirmed: 0, sumMaxConfirmed: 0, revenue: 0 };
}

export type NetworkForecast = {
  range: ForecastRange;
  windowDays: number;
  method: ForecastMethod;
  occurrences: number;
  games: ForecastMetric;
  confirmationRate: ForecastMetric;
  occupancyRate: ForecastMetric;
  revenue: ForecastMetric;
  predictedConfirmedGames: number | null;
  predictedCancelledGames: number | null;
  // Mismo período, año pasado: dato REAL ya ocurrido (no proyectado), como
  // ancla de sanity-check — mismo criterio YoY que ya usa el Pareto de Market.
  sameWindowLastYear: { totalGames: number; confirmationRate: number } | null;
};

async function getNetworkForecastImpl(
  filters: Omit<OverviewFilters, "dateFrom" | "dateTo">,
  range: ForecastRange,
  todayISOStr: string
): Promise<NetworkForecast> {
  const blockDays = RANGE_DAYS[range];
  const today = parseISODate(todayISOStr);
  const windowEnd = addDaysUTC(today, -1);

  // Un bloque por índice (0 = el más antiguo, LOOKBACK_BLOCKS-1 = el más
  // reciente, terminado ayer) — mismo criterio de indexado que
  // getDailyForecast. Antes esto era un findMany crudo de TODOS los
  // partidos de la red en la ventana completa (hasta 12*30 días) y el
  // binning se hacía partido por partido en JS. Con la red completa eso es
  // fácilmente decenas de miles de filas viajando desde Neon en cada
  // cache-miss. Ahora cada bloque se agrega directamente en Postgres
  // (count + sum) — 12 bloques × 2 consultas chiquitas en vez de una
  // consulta gigante: lo que viaja por red es un puñado de números, nunca
  // una fila por partido.
  const blockRanges = Array.from({ length: LOOKBACK_BLOCKS }, (_, idx) => {
    const blockFromEnd = LOOKBACK_BLOCKS - 1 - idx;
    const blockDateTo = addDaysUTC(windowEnd, -blockFromEnd * blockDays);
    const blockDateFrom = addDaysUTC(blockDateTo, -(blockDays - 1));
    return { blockDateFrom, blockDateTo };
  });

  const blocks: BlockTotals[] = await Promise.all(
    blockRanges.map(async ({ blockDateFrom, blockDateTo }) => {
      const blockWhere = buildWhere({ ...filters, dateFrom: blockDateFrom, dateTo: blockDateTo });
      const [totalAgg, demandBaseCount, confirmedAgg] = await Promise.all([
        prisma.game.aggregate({ where: blockWhere, _count: { _all: true } }),
        prisma.game.count({ where: withDemandOnly(blockWhere) }),
        prisma.game.aggregate({
          where: { ...blockWhere, status: "CONFIRMED" },
          _count: { _all: true },
          _sum: { finalPlayers: true, maxPlayers: true, eventRevenue: true },
        }),
      ]);
      return {
        totalGames: totalAgg._count._all,
        demandBase: demandBaseCount,
        confirmedGames: confirmedAgg._count._all,
        sumFinalConfirmed: confirmedAgg._sum.finalPlayers ?? 0,
        sumMaxConfirmed: confirmedAgg._sum.maxPlayers ?? 0,
        revenue: confirmedAgg._sum.eventRevenue ?? 0,
      };
    })
  );

  // Bloques sin NINGÚN partido se descartan (no se interpolan con 0): mismo
  // criterio que getRecentDailyTrend/getDailyForecast — "sin dato" no es
  // "cero demanda". Un bloque de 7-30 días con cero partidos casi seguro es
  // un hueco real de datos, no una lectura válida para la serie.
  const withData = blocks.filter((b) => b.totalGames > 0);
  const n = withData.length;
  const method: ForecastMethod = n >= MIN_BLOCKS_FOR_TREND ? "regression" : n >= MIN_BLOCKS_FOR_PREDICTION ? "average" : "insufficient";

  const gamesMetric = buildMetric(withData.map((b) => b.totalGames), n, method, null);
  // % de DEMANDA: confirmados / (confirmados + cancelados por demanda). Se regresiona sobre
  // los bloques que tienen base de demanda (un bloque sin base no dice nada de la tasa).
  const withDemand = withData.filter((b) => b.demandBase > 0);
  const confirmationSeries = withDemand.map((b) => b.confirmedGames / b.demandBase);
  const confirmationMetric = buildMetric(confirmationSeries, withDemand.length, method, [0, 1]);
  // Parte de lo publicado que es "demanda" (el resto son cancelaciones de cancha no disponible,
  // operativas o plugin). Se usa para pasar de partidos agendados a confirmados esperados sin
  // sobreestimar: confirmados = agendados × parte de demanda × tasa de demanda.
  const sumTotal = withData.reduce((a, b) => a + b.totalGames, 0);
  const demandShare = sumTotal > 0 ? withData.reduce((a, b) => a + b.demandBase, 0) / sumTotal : 1;
  const occupancySeries = withData.map((b) => (b.sumMaxConfirmed > 0 ? b.sumFinalConfirmed / b.sumMaxConfirmed : 0));
  const occupancyMetric = buildMetric(occupancySeries, n, method, [0, 1]);
  const revenueMetric = buildMetric(withData.map((b) => b.revenue), n, method, null);

  // Desglose confirmados/cancelados esperado: se deriva de games×confirmación
  // (no una tercera regresión independiente) para que los dos números SIEMPRE
  // sumen el total esperado — nunca una inconsistencia de redondeo entre
  // "partidos esperados" y "confirmados + cancelados esperados".
  let predictedConfirmedGames: number | null = null;
  let predictedCancelledGames: number | null = null;
  if (gamesMetric.predicted !== null && confirmationMetric.predicted !== null) {
    const totalRounded = Math.round(gamesMetric.predicted);
    predictedConfirmedGames = Math.round(gamesMetric.predicted * demandShare * confirmationMetric.predicted);
    predictedCancelledGames = totalRounded - predictedConfirmedGames;
  }

  // Mismo período, año pasado: ventana real (no un bloque histórico de la
  // regresión) — el tramo de fechas exacto que hoy+rango representaría si
  // hubiera pasado hace un año.
  const yoyStart = new Date(today);
  yoyStart.setUTCFullYear(yoyStart.getUTCFullYear() - 1);
  const yoyEnd = new Date(addDaysUTC(today, blockDays - 1));
  yoyEnd.setUTCFullYear(yoyEnd.getUTCFullYear() - 1);
  // Antes: findMany crudo de status por partido en la ventana YoY, contado
  // en JS. Ahora dos count() — uno total, uno filtrado — mismo patrón que
  // el resto de este archivo: solo viajan dos números.
  const yoyWhere = buildWhere({ ...filters, dateFrom: yoyStart, dateTo: yoyEnd });
  const [yoyTotal, yoyDemandBase, yoyConfirmed] = await Promise.all([
    prisma.game.count({ where: yoyWhere }),
    prisma.game.count({ where: withDemandOnly(yoyWhere) }),
    prisma.game.count({ where: { ...yoyWhere, status: "CONFIRMED" } }),
  ]);
  const sameWindowLastYear = yoyTotal > 0 && yoyDemandBase > 0 ? { totalGames: yoyTotal, confirmationRate: yoyConfirmed / yoyDemandBase } : null;

  return {
    range,
    windowDays: blockDays,
    method,
    occurrences: n,
    games: gamesMetric,
    confirmationRate: confirmationMetric,
    occupancyRate: occupancyMetric,
    revenue: revenueMetric,
    predictedConfirmedGames,
    predictedCancelledGames,
    sameWindowLastYear,
  };
}

export const getNetworkForecast = cached("getNetworkForecast", getNetworkForecastImpl);

// ---------- Radar de riesgo hacia ADELANTE: qué facilities vigilar ----------
// Extensión de la misma idea que getDailyRiskFacilities (Daily), pero
// mirando hacia adelante en vez de hacia atrás: en vez de "¿cuánto cayó en
// las últimas 2 semanas?", acá es "¿la tendencia de esta facility, si sigue
// igual, la deja peor en la ventana pronosticada?". Solo tiene sentido
// cuando el filtro NO ya apunta a una sola facility (ahí no hay nada que
// rankear — el pronóstico principal de arriba ya es su tendencia).
// Mismo criterio de ranking por POSICIÓN (no una fórmula con pesos) que
// getDailyRiskFacilities: se suman dos posiciones (caída de confirmación
// proyectada + cancelados proyectados) y se ordena ascendente.

export type ForecastRiskFacility = {
  facilityId: string;
  facilityName: string;
  predictedGames: number | null;
  predictedConfirmationRate: number | null;
  confirmationRateDelta: number | null; // predicted - avg histórico de esa misma facility
  predictedCancelledGames: number | null;
};

// Fila de conteo de un groupBy por facility, para un bloque puntual — mismo
// shape que ya usa getDailyRiskFacilitiesImpl/getContributionRanking.
type FacilityBlockCountRow = { facilityId: string; _count: { _all: number } };

async function getForecastRiskFacilitiesImpl(
  filters: Omit<OverviewFilters, "dateFrom" | "dateTo">,
  range: ForecastRange,
  todayISOStr: string,
  limit = 5
): Promise<ForecastRiskFacility[]> {
  if (filters.facilityId) return [];

  const blockDays = RANGE_DAYS[range];
  const today = parseISODate(todayISOStr);
  const windowEnd = addDaysUTC(today, -1);

  // Mismo cambio que getNetworkForecastImpl: antes era un findMany crudo de
  // TODA la red (facilityId + date + status, sin filtrar por facility) en
  // la ventana de 12 bloques, binned partido por partido en JS. Ahora cada
  // bloque se agrega por facility directo en Postgres (groupBy), 12 bloques
  // × 2 consultas (total + confirmados) — lo que viaja son conteos por
  // facility, nunca una fila por partido.
  const blockRanges = Array.from({ length: LOOKBACK_BLOCKS }, (_, idx) => {
    const blockFromEnd = LOOKBACK_BLOCKS - 1 - idx;
    const blockDateTo = addDaysUTC(windowEnd, -blockFromEnd * blockDays);
    const blockDateFrom = addDaysUTC(blockDateTo, -(blockDays - 1));
    return { blockDateFrom, blockDateTo };
  });

  const [blockGroups, facilityRows] = await Promise.all([
    Promise.all(
      blockRanges.map(async ({ blockDateFrom, blockDateTo }) => {
        const blockWhere = buildWhere({ ...filters, dateFrom: blockDateFrom, dateTo: blockDateTo });
        const [totals, confirmed, demand] = (await Promise.all([
          prisma.game.groupBy({ by: ["facilityId"], where: blockWhere, _count: { _all: true } }),
          prisma.game.groupBy({ by: ["facilityId"], where: { ...blockWhere, status: "CONFIRMED" }, _count: { _all: true } }),
          prisma.game.groupBy({ by: ["facilityId"], where: withDemandOnly(blockWhere), _count: { _all: true } }),
        ])) as [FacilityBlockCountRow[], FacilityBlockCountRow[], FacilityBlockCountRow[]];
        return { totals, confirmed, demand };
      })
    ),
    prisma.facility.findMany({ select: { id: true, name: true } }) as Promise<{ id: string; name: string }[]>,
  ]);
  const nameById = new Map(facilityRows.map((f): [string, string] => [f.id, f.name]));

  const byFacility = new Map<string, BlockTotals[]>();
  blockGroups.forEach(({ totals, confirmed, demand }, idx) => {
    const confirmedByFacility = new Map(confirmed.map((g): [string, number] => [g.facilityId, Number(g._count._all)]));
    const demandByFacility = new Map(demand.map((g): [string, number] => [g.facilityId, Number(g._count._all)]));
    for (const g of totals) {
      const blocks = byFacility.get(g.facilityId) ?? Array.from({ length: LOOKBACK_BLOCKS }, emptyBlock);
      blocks[idx].totalGames = Number(g._count._all);
      blocks[idx].confirmedGames = confirmedByFacility.get(g.facilityId) ?? 0;
      blocks[idx].demandBase = demandByFacility.get(g.facilityId) ?? 0;
      byFacility.set(g.facilityId, blocks);
    }
  });

  type Candidate = {
    facilityId: string;
    facilityName: string;
    predictedGames: number;
    predictedConfirmationRate: number;
    confirmationRateDelta: number;
    predictedCancelledGames: number;
  };
  const candidates: Candidate[] = [];

  for (const [facilityId, blocks] of byFacility.entries()) {
    const withData = blocks.filter((b) => b.totalGames > 0);
    const n = withData.length;
    if (n < MIN_BLOCKS_FOR_TREND) continue; // sin suficiente historial propio, no entra al ranking (mismo piso que el resto)

    const gamesSeries = withData.map((b) => b.totalGames);
    const withDemand = withData.filter((b) => b.demandBase > 0);
    if (withDemand.length < MIN_BLOCKS_FOR_TREND) continue;
    const rateSeries = withDemand.map((b) => b.confirmedGames / b.demandBase); // tasa de demanda
    const sumTotal = withData.reduce((a, b) => a + b.totalGames, 0);
    const demandShare = sumTotal > 0 ? withData.reduce((a, b) => a + b.demandBase, 0) / sumTotal : 1;
    const gamesMetric = buildMetric(gamesSeries, n, "regression", null);
    const rateMetric = buildMetric(rateSeries, withDemand.length, "regression", [0, 1]);
    if (gamesMetric.predicted === null || rateMetric.predicted === null || gamesMetric.avg === null || rateMetric.avg === null) continue;

    const predictedConfirmed = Math.round(gamesMetric.predicted * demandShare * rateMetric.predicted);
    candidates.push({
      facilityId,
      facilityName: nameById.get(facilityId) ?? "",
      predictedGames: gamesMetric.predicted,
      predictedConfirmationRate: rateMetric.predicted,
      confirmationRateDelta: rateMetric.predicted - rateMetric.avg,
      predictedCancelledGames: Math.round(gamesMetric.predicted) - predictedConfirmed,
    });
  }

  if (candidates.length === 0) return [];

  // Solo entran facilities con una señal real de deterioro proyectado — ni
  // siquiera aparecen las que vienen igual o mejor, mismo criterio que
  // getDailyRiskFacilities (una lista de "para vigilar" no necesita semáforo
  // en verde).
  const declining = candidates.filter((c) => c.confirmationRateDelta < 0 || c.predictedCancelledGames >= 3);
  if (declining.length === 0) return [];

  const byRateDrop = [...declining].sort((a, b) => a.confirmationRateDelta - b.confirmationRateDelta);
  const byCancelled = [...declining].sort((a, b) => b.predictedCancelledGames - a.predictedCancelledGames);
  const rateDropRank = new Map(byRateDrop.map((c, i) => [c.facilityId, i + 1]));
  const cancelledRank = new Map(byCancelled.map((c, i) => [c.facilityId, i + 1]));

  return declining
    .map((c) => ({ c, rank: (rateDropRank.get(c.facilityId) ?? declining.length) + (cancelledRank.get(c.facilityId) ?? declining.length) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ c }): ForecastRiskFacility => ({
      facilityId: c.facilityId,
      facilityName: c.facilityName,
      predictedGames: c.predictedGames,
      predictedConfirmationRate: c.predictedConfirmationRate,
      confirmationRateDelta: c.confirmationRateDelta,
      predictedCancelledGames: c.predictedCancelledGames,
    }));
}

export const getForecastRiskFacilities = cached("getForecastRiskFacilities", getForecastRiskFacilitiesImpl);
