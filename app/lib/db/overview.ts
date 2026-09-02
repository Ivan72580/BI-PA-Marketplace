import { Prisma, CancellationCategory, GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, labelForCancellationCategory, sortHoursByOperatingDay, MIN_GAMES_FOR_RANKING, type OverviewFilters } from "./shared";

async function getOverviewDataImpl(filters: OverviewFilters) {
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
  ]);

  const confirmationRate = total > 0 ? confirmedCount / total : 0;
  const cancellationRate = total > 0 ? cancelledCount / total : 0;

  // Revenue: dato secundario — la fuente no es 100% confiable (mezcla de
  // esquemas de precio distintos), no debe ser el KPI que guíe decisiones.
  const totalRevenue = revenueAgg._sum.eventRevenue ?? 0;
  const avgRevenuePerGame = confirmedCount > 0 ? totalRevenue / confirmedCount : 0;

  // Ocupación: suma de jugadores finales / suma de cupo máximo (ponderado
  // por tamaño real de cada partido, no un promedio simple de porcentajes).
  const sumFinalPlayers = fillAgg._sum.finalPlayers ?? 0;
  const sumMaxPlayers = fillAgg._sum.maxPlayers ?? 0;
  const avgFillRate = sumMaxPlayers > 0 ? sumFinalPlayers / sumMaxPlayers : 0;

  const cancellationBreakdown = cancellationGroups
    .map((g) => {
      const category = g.cancellationCategory ?? CancellationCategory.OTHER;
      const count = Number(g._count._all);
      return {
        category,
        label: labelForCancellationCategory(category),
        count,
        pct: cancelledCount > 0 ? count / cancelledCount : 0,
      };
    })
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

  type FacilityAgg = {
    id: string;
    name: string;
    marketId: string;
    regionId: string;
    revenue: number;
    cancelledCount: number;
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

  // Ranking por TASA: top 10 facilities con peor % de cancelación (equivale a
  // la peor tasa de confirmación, ya que en estos datos son complementarias),
  // exigiendo un mínimo de partidos para que la tasa sea representativa.
  const worstCancellationRate = [...facilities]
    .filter((f) => f.totalCount >= MIN_GAMES_FOR_RANKING)
    .map((f) => ({
      facilityId: f.id,
      marketId: f.marketId,
      regionId: f.regionId,
      label: f.name,
      rate: f.cancelledCount / f.totalCount,
      totalGames: f.totalCount,
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10);

  const insights = generateOverviewInsights({
    confirmationRate,
    cancellationRate,
    avgFillRate,
    cancellationBreakdown,
    totalGames: total,
    worstCancellationRate,
  });

  return {
    totalGames: total,
    confirmedGames: confirmedCount,
    cancelledGames: cancelledCount,
    confirmationRate,
    cancellationRate,
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
    insights,
  };
}

export const getOverviewData = cached("getOverviewData", getOverviewDataImpl);

export type OverviewData = Awaited<ReturnType<typeof getOverviewDataImpl>>;

function generateOverviewInsights(m: {
  confirmationRate: number;
  cancellationRate: number;
  avgFillRate: number;
  cancellationBreakdown: { category: string; label: string; count: number; pct: number }[];
  totalGames: number;
  worstCancellationRate: { label: string; rate: number; totalGames: number }[];
}): string[] {
  const insights: string[] = [];

  if (m.totalGames === 0) {
    return ["No hay partidos registrados para el período/filtro seleccionado."];
  }

  if (m.confirmationRate < 0.5) {
    insights.push(
      `⚠ Solo se confirma el ${(m.confirmationRate * 100).toFixed(1)}% de los partidos programados — la demanda no está alcanzando el mínimo de jugadores en más de la mitad de los casos.`
    );
  }

  const topReason = m.cancellationBreakdown[0];
  if (topReason && topReason.pct > 0.35) {
    insights.push(
      `⚠ "${topReason.label}" explica el ${(topReason.pct * 100).toFixed(0)}% de las cancelaciones (${topReason.count} partidos) — es el principal punto a atacar.`
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
        `⚠ ${worst.label} cancela el ${(worst.rate * 100).toFixed(0)}% de sus partidos (${worst.totalGames} en el período), ${gapPoints.toFixed(0)} puntos por encima del promedio de la red (${(m.cancellationRate * 100).toFixed(0)}%).`
      );
    }
  }

  if (m.avgFillRate > 0.95) {
    insights.push(
      `✓ Los partidos confirmados se llenan al ${(m.avgFillRate * 100).toFixed(1)}% de su capacidad promedio — hay señal para evaluar ampliar cupo o sumar horarios similares.`
    );
  }

  if (insights.length === 0) {
    insights.push("No se detectaron alertas relevantes en el período seleccionado.");
  }

  return insights;
}
