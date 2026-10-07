import { Prisma, CancellationCategory, GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, labelForCancellationCategory, sortHoursByOperatingDay, MIN_GAMES_FOR_RANKING, type OverviewFilters } from "./shared";
import { getOverviewTranslator, type OverviewTranslator } from "./overviewMessages";
import type { Locale } from "@/i18n/config";
import { addToBuckets, bucketOf, demandRate, emptyBuckets, rawRate } from "../metrics";

// `locale` se agrega como argumento explícito porque este texto se genera
// DENTRO de una función cacheada con unstable_cache — ver el comentario en
// overviewMessages.ts (mismo patrón que dailyMessages.ts/trendsMessages.ts
// para Daily/Trends). Default "es" para que los call sites que no lo pasan
// (ej. trends/page.tsx, que solo usa las tasas numéricas, nunca .insights ni
// .cancellationBreakdown) mantengan el comportamiento EXACTO de antes.
async function getOverviewDataImpl(filters: OverviewFilters, locale: Locale = "es") {
  const where = buildWhere(filters);
  const confirmedWhere: Prisma.GameWhereInput = { ...where, status: GameStatus.CONFIRMED };
  const cancelledWhere: Prisma.GameWhereInput = { ...where, status: GameStatus.CANCELLED };

  // En vez de traer cada partido y contarlos en JS, le pedimos a Postgres
  // los agregados directamente (count/sum/groupBy) — mucho menos dato viaja
  // por la red, y el conteo lo hace la base, no Node.
  const [
    total,
    confirmedCount,
    cancelledCount,
    revenueAgg,
    fillAgg,
    cancellationGroups,
    hourRows,
    facilityTotals,
    facilityCancelled,
    facilityConfirmedCounts,
    facilityRevenue,
    facilityCancelledByCategory,
  ] = await Promise.all([
    prisma.game.count({ where }),
    prisma.game.count({ where: confirmedWhere }),
    prisma.game.count({ where: cancelledWhere }),
    prisma.game.aggregate({ where: confirmedWhere, _sum: { eventRevenue: true } }),
    prisma.game.aggregate({ where: confirmedWhere, _sum: { finalPlayers: true, maxPlayers: true } }),
    prisma.game.groupBy({ by: ["cancellationCategory"], where: cancelledWhere, _count: { _all: true } }),
    // Este sí necesita fila por fila (la hora sale de un substring del texto,
    // Postgres no lo agrupa por nosotros vía Prisma) — pero traemos SOLO esa
    // columna, no las otras 7-8 que traía antes.
    prisma.game.findMany({ where, select: { time: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: cancelledWhere, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: confirmedWhere, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: confirmedWhere, _sum: { eventRevenue: true } }),
    // Cancelaciones por facility Y categoría: para separar las que cuentan contra la demanda.
    prisma.game.groupBy({ by: ["facilityId", "cancellationCategory"], where: cancelledWhere, _count: { _all: true } }),
  ]);

  // Tasa de DEMANDA (ver app/lib/metrics.ts): las cancelaciones que no hablan de
  // demanda (cancha no disponible, operativas/externas, plugin) salen del denominador.
  // La tasa cruda (sobre todo lo publicado) se conserva aparte, etiquetada.
  const cancelBuckets = emptyBuckets();
  for (const g of cancellationGroups) addToBuckets(cancelBuckets, g.cancellationCategory, Number(g._count._all));
  const demandGames = confirmedCount + cancelBuckets.demand;
  const confirmationRate = demandRate(confirmedCount, cancelBuckets.demand);
  const cancellationRate = demandGames > 0 ? cancelBuckets.demand / demandGames : 0;
  const rawConfirmationRate = rawRate(confirmedCount, cancelledCount);

  // Revenue: dato secundario — la fuente no es 100% confiable (mezcla de
  // esquemas de precio distintos), no debe ser el KPI que guíe decisiones.
  const totalRevenue = revenueAgg._sum.eventRevenue ?? 0;
  const avgRevenuePerGame = confirmedCount > 0 ? totalRevenue / confirmedCount : 0;

  // Ocupación: suma de jugadores finales / suma de cupo máximo (ponderado
  // por tamaño real de cada partido, no un promedio simple de porcentajes).
  const sumFinalPlayers = fillAgg._sum.finalPlayers ?? 0;
  const sumMaxPlayers = fillAgg._sum.maxPlayers ?? 0;
  const avgFillRate = sumMaxPlayers > 0 ? sumFinalPlayers / sumMaxPlayers : 0;

  // groupBy({ by: ["cancellationCategory"] }) trae un grupo separado para
  // cancellationCategory=null (partido cancelado sin motivo cargado) y otro
  // para el valor real CancellationCategory.OTHER — dos grupos DISTINTOS
  // para Prisma. Antes esto solo renombraba cada uno a "OTHER" sin
  // fusionarlos, así que podían convivir dos filas con el mismo category
  // (bug real: dividía el conteo de "Otro" en dos, y en React disparaba
  // "Encountered two children with the same key" en el breakdown de
  // NetworkOverview, que usa reason.category como key). Acá se fusionan por
  // el category YA resuelto, sumando sus conteos, antes de calcular pct.
  const cancellationCounts = new Map<CancellationCategory, number>();
  for (const g of cancellationGroups) {
    const category = g.cancellationCategory ?? CancellationCategory.OTHER;
    cancellationCounts.set(category, (cancellationCounts.get(category) ?? 0) + Number(g._count._all));
  }
  const cancellationBreakdown = Array.from(cancellationCounts.entries())
    .map(([category, count]) => ({
      category,
      label: labelForCancellationCategory(category, locale),
      count,
      bucket: bucketOf(category),
      pct: cancelledCount > 0 ? count / cancelledCount : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Partidos por hora del día
  const byHour = new Map<string, number>();
  for (const row of hourRows) {
    const hour = row.time?.slice(0, 2) || "??";
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
  }
  const gamesByHour = sortHoursByOperatingDay(Array.from(byHour.keys()).filter((h) => h !== "??")).map((hour) => ({
    hour: `${hour}h`,
    count: byHour.get(hour) ?? 0,
  }));

  // Nombre/market/región de las facilities involucradas — un solo lookup
  // chico (acotado a la cantidad de facilities con partidos en este filtro),
  // no traído junto con cada partido como antes.
  const facilityIds = facilityTotals.map((f) => f.facilityId);
  type FacilityInfo = { id: string; name: string; marketId: string; market: { regionId: string } };
  const facilityInfo = (await prisma.facility.findMany({
    where: { id: { in: facilityIds } },
    select: { id: true, name: true, marketId: true, market: { select: { regionId: true } } },
  })) as FacilityInfo[];
  const facilityInfoMap = new Map(facilityInfo.map((f): [string, typeof f] => [f.id, f]));

  const cancelledByFacility = new Map<string, number>(facilityCancelled.map((f) => [f.facilityId, Number(f._count._all)]));
  const confirmedByFacility = new Map<string, number>(facilityConfirmedCounts.map((f) => [f.facilityId, Number(f._count._all)]));
  const revenueByFacility = new Map<string, number>(facilityRevenue.map((f) => [f.facilityId, f._sum.eventRevenue ?? 0]));
  const demandCancelledByFacility = new Map<string, number>();
  for (const g of facilityCancelledByCategory) {
    if (bucketOf(g.cancellationCategory) !== "demand") continue;
    demandCancelledByFacility.set(g.facilityId, (demandCancelledByFacility.get(g.facilityId) ?? 0) + Number(g._count._all));
  }

  type FacilityAgg = {
    id: string;
    name: string;
    marketId: string;
    regionId: string;
    revenue: number;
    cancelledCount: number;
    demandCancelledCount: number;
    confirmedCount: number;
    totalCount: number;
  };
  const facilities: FacilityAgg[] = facilityTotals
    .map((f) => {
      const info = facilityInfoMap.get(f.facilityId);
      if (!info) return null;
      return {
        id: f.facilityId,
        name: info.name,
        marketId: info.marketId,
        regionId: info.market.regionId,
        totalCount: Number(f._count._all),
        cancelledCount: cancelledByFacility.get(f.facilityId) ?? 0,
        demandCancelledCount: demandCancelledByFacility.get(f.facilityId) ?? 0,
        confirmedCount: confirmedByFacility.get(f.facilityId) ?? 0,
        revenue: revenueByFacility.get(f.facilityId) ?? 0,
      };
    })
    .filter((f): f is FacilityAgg => f !== null);

  // Ranking Pareto: top 10 facilities por VOLUMEN de cancelaciones, con % acumulado.
  // Responde "¿dónde se concentra el problema?", no "¿quién tiene la peor tasa?".
  const sortedByCancelledCount = [...facilities]
    .filter((f) => f.cancelledCount > 0)
    .sort((a, b) => b.cancelledCount - a.cancelledCount);
  let cumulative = 0;
  const paretoCancellations = sortedByCancelledCount.slice(0, 10).map((f) => {
    cumulative += f.cancelledCount;
    return {
      facilityId: f.id,
      marketId: f.marketId,
      regionId: f.regionId,
      label: f.name,
      value: f.cancelledCount,
      cumulativePct: cancelledCount > 0 ? cumulative / cancelledCount : 0,
    };
  });
  const paretoCoveragePct =
    cancelledCount > 0 && paretoCancellations.length > 0
      ? paretoCancellations[paretoCancellations.length - 1].cumulativePct
      : 0;

  // Ranking Pareto de CONFIRMADOS: dónde se concentra el volumen real de
  // negocio (contraparte del de cancelaciones, que muestra dónde se concentra
  // el problema). Mismo criterio de % acumulado.
  const sortedByConfirmedCount = [...facilities]
    .filter((f) => f.confirmedCount > 0)
    .sort((a, b) => b.confirmedCount - a.confirmedCount);
  let cumulativeConfirmed = 0;
  const paretoConfirmations = sortedByConfirmedCount.slice(0, 10).map((f) => {
    cumulativeConfirmed += f.confirmedCount;
    return {
      facilityId: f.id,
      marketId: f.marketId,
      regionId: f.regionId,
      label: f.name,
      value: f.confirmedCount,
      cumulativePct: confirmedCount > 0 ? cumulativeConfirmed / confirmedCount : 0,
    };
  });
  const paretoConfirmedCoveragePct =
    confirmedCount > 0 && paretoConfirmations.length > 0
      ? paretoConfirmations[paretoConfirmations.length - 1].cumulativePct
      : 0;

  // Ranking por TASA: top 10 facilities con peor % de cancelación POR DEMANDA
  // (equivale a la peor tasa de demanda, ya que son complementarias), exigiendo un
  // mínimo de partidos que cuentan para la demanda para que la tasa sea representativa.
  const worstCancellationRate = [...facilities]
    .map((f) => ({ f, demandTotal: f.confirmedCount + f.demandCancelledCount }))
    .filter(({ demandTotal }) => demandTotal >= MIN_GAMES_FOR_RANKING)
    .map(({ f, demandTotal }) => ({
      facilityId: f.id,
      marketId: f.marketId,
      regionId: f.regionId,
      label: f.name,
      rate: f.demandCancelledCount / demandTotal,
      totalGames: demandTotal,
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10);

  const insights = generateOverviewInsights({
    confirmationRate,
    cancellationRate,
    cancellationBreakdown,
    totalGames: total,
    worstCancellationRate,
  }, getOverviewTranslator(locale));

  // Top 5 facilities por revenue (mismo `eventRevenue` que compone
  // `totalRevenue` arriba, no la estimación de Market — así el popover del
  // KPI de Revenue en Overview siempre es consistente con el número
  // grande de la tarjeta). Se usa cuando no hay un market puntual elegido
  // (a nivel red/región, donde el KPI hoy no tiene a dónde llevar al hacer
  // click).
  const topRevenueFacilities = [...facilities]
    .filter((f) => f.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((f) => ({ facilityId: f.id, marketId: f.marketId, regionId: f.regionId, label: f.name, value: f.revenue }));

  return {
    totalGames: total,
    confirmedGames: confirmedCount,
    cancelledGames: cancelledCount,
    confirmationRate,
    cancellationRate,
    // Tasa cruda y desglose de lo que quedó fuera de la demanda (metrics.ts).
    rawConfirmationRate,
    demandGames,
    demandCancelledGames: cancelBuckets.demand,
    fieldUnavailableGames: cancelBuckets.fieldUnavailable,
    operationalCancelledGames: cancelBuckets.operational,
    pluginCancelledGames: cancelBuckets.plugin,
    avgFillRate,
    totalRevenue,
    avgRevenuePerGame,
    cancellationBreakdown,
    gamesByHour,
    paretoCancellations,
    paretoCoveragePct,
    paretoConfirmations,
    paretoConfirmedCoveragePct,
    worstCancellationRate,
    topRevenueFacilities,
    insights,
  };
}

export const getOverviewData = cached("getOverviewData", getOverviewDataImpl);

export type OverviewData = Awaited<ReturnType<typeof getOverviewDataImpl>>;

// Para el insight "esta facility necesita atención": dado un motivo de
// cancelación puntual (típicamente el #1 de la región), qué facility
// concentra más cancelaciones por ese motivo específico.
async function getTopCancellationFacilityForReasonImpl(
  filters: OverviewFilters,
  category: CancellationCategory
): Promise<{ facilityId: string; name: string; count: number } | null> {
  const where = buildWhere(filters);
  const groups = await prisma.game.groupBy({
    by: ["facilityId"],
    where: { ...where, status: GameStatus.CANCELLED, cancellationCategory: category },
    _count: { _all: true },
  });
  if (groups.length === 0) return null;

  const top = [...groups].sort((a, b) => Number(b._count._all) - Number(a._count._all))[0];
  const facility = await prisma.facility.findUnique({ where: { id: top.facilityId }, select: { name: true } });
  return { facilityId: top.facilityId, name: facility?.name ?? "—", count: Number(top._count._all) };
}

export const getTopCancellationFacilityForReason = cached(
  "getTopCancellationFacilityForReason",
  getTopCancellationFacilityForReasonImpl
);

// ---------- Ranking por motivo de cancelación (drill-down desde Overview) ----------
// Al hacer click en un motivo de "Cancellation reasons" en Overview: todas
// las facilities con al menos una cancelación por ESE motivo en el período
// filtrado, con la variación (% y valor absoluto) contra el período de
// comparación de esa misma vista (mes anterior por default — ver
// resolvePartialPriorMonth en page.tsx). Solo incluye facilities con
// cancelaciones por este motivo AHORA — una que tenía el problema y ya no,
// no es parte de "quién está involucrado en el período seleccionado".
export type CancellationReasonFacilityRow = {
  facilityId: string;
  marketId: string;
  regionId: string;
  name: string;
  count: number;
  // null = no hay período de comparación disponible (ej. granularity "all"
  // o "custom") — distinto de 0, que sí es un valor real (pasó de 0 a N).
  priorCount: number | null;
};

async function getCancellationReasonRankingImpl(
  filters: OverviewFilters,
  category: CancellationCategory,
  priorRange: { dateFrom?: Date; dateTo?: Date } | null
): Promise<CancellationReasonFacilityRow[]> {
  const categoryWhere: Prisma.GameWhereInput = { ...buildWhere(filters), status: GameStatus.CANCELLED, cancellationCategory: category };
  const groups = await prisma.game.groupBy({ by: ["facilityId"], where: categoryWhere, _count: { _all: true } });
  if (groups.length === 0) return [];

  const priorGroups =
    priorRange?.dateFrom && priorRange?.dateTo
      ? await prisma.game.groupBy({
          by: ["facilityId"],
          where: {
            ...buildWhere({ ...filters, dateFrom: priorRange.dateFrom, dateTo: priorRange.dateTo }),
            status: GameStatus.CANCELLED,
            cancellationCategory: category,
          },
          _count: { _all: true },
        })
      : null;
  const priorMap = priorGroups ? new Map(priorGroups.map((g) => [g.facilityId, Number(g._count._all)])) : null;

  const facilityIds = groups.map((g) => g.facilityId);
  type FacilityInfo = { id: string; name: string; marketId: string; market: { regionId: string } };
  const facilityInfo = (await prisma.facility.findMany({
    where: { id: { in: facilityIds } },
    select: { id: true, name: true, marketId: true, market: { select: { regionId: true } } },
  })) as FacilityInfo[];
  const infoMap = new Map(facilityInfo.map((f): [string, typeof f] => [f.id, f]));

  return groups
    .map((g) => {
      const info = infoMap.get(g.facilityId);
      if (!info) return null;
      return {
        facilityId: g.facilityId,
        marketId: info.marketId,
        regionId: info.market.regionId,
        name: info.name,
        count: Number(g._count._all),
        priorCount: priorMap ? priorMap.get(g.facilityId) ?? 0 : null,
      };
    })
    .filter((r): r is CancellationReasonFacilityRow => r !== null)
    .sort((a, b) => b.count - a.count);
}

export const getCancellationReasonRanking = cached("getCancellationReasonRanking", getCancellationReasonRankingImpl);

function generateOverviewInsights(m: {
  confirmationRate: number;
  cancellationRate: number;
  cancellationBreakdown: { category: string; label: string; count: number; pct: number }[];
  totalGames: number;
  worstCancellationRate: { label: string; rate: number; totalGames: number }[];
}, t: OverviewTranslator): string[] {
  const insights: string[] = [];

  if (m.totalGames === 0) {
    return [t("insights.noGames")];
  }

  if (m.confirmationRate < 0.5) {
    insights.push(t("insights.lowConfirmation", { pct: (m.confirmationRate * 100).toFixed(1) }));
  }

  const topReason = m.cancellationBreakdown[0];
  if (topReason && topReason.pct > 0.35) {
    insights.push(
      t("insights.topReason", { reason: topReason.label, pct: (topReason.pct * 100).toFixed(0), count: topReason.count })
    );
  }

  // Outlier relativo al promedio de la red en este mismo filtro — no contra
  // un número fijo. "¿Se está desviando de lo que es normal acá?"
  const OUTLIER_GAP_POINTS = 15;
  const worst = m.worstCancellationRate[0];
  if (worst) {
    const gapPoints = (worst.rate - m.cancellationRate) * 100;
    if (gapPoints >= OUTLIER_GAP_POINTS) {
      insights.push(
        t("insights.outlier", {
          facility: worst.label,
          rate: (worst.rate * 100).toFixed(0),
          games: worst.totalGames,
          gap: gapPoints.toFixed(0),
          networkRate: (m.cancellationRate * 100).toFixed(0),
        })
      );
    }
  }

  if (insights.length === 0) {
    insights.push(t("insights.noAlerts"));
  }

  return insights;
}
