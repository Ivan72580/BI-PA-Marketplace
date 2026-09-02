import { GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, type OverviewFilters } from "./shared";

export type OrganizerBreakdownRow = { organizer: string; count: number; confirmedCount: number; cancellationRate: number };

async function getExtendedMetricsImpl(filters: OverviewFilters) {
  const where = buildWhere(filters);

  const [
    totalCount,
    organizerTotals,
    organizerCancelled,
    ratedGames,
    demandAgg,
    missingAgg,
    leadTimeRows,
    priceAgg,
  ] = await Promise.all([
    prisma.game.count({ where }),
    prisma.game.groupBy({ by: ["organizer"], where, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["organizer"], where: { ...where, status: GameStatus.CANCELLED }, _count: { _all: true } }),
    // Rating ponderado necesita las dos columnas juntas por fila (no es una
    // suma simple) — pero filtramos a solo los partidos que sí tienen rating,
    // que suelen ser una fracción chica del total.
    prisma.game.findMany({
      where: { ...where, ratingCount: { gt: 0 } },
      select: { ratingCount: true, averageRating: true },
    }),
    prisma.game.aggregate({ where, _sum: { waitlistPlayers: true, droppedPlayers: true } }),
    prisma.game.aggregate({
      where: { ...where, playersMissing: { gt: 0 } },
      _avg: { playersMissing: true },
      _count: { _all: true },
    }),
    // Mediana: Postgres/Prisma no la calculan por nosotros vía el query
    // builder, así que traemos solo esta columna (nada más) para ordenar acá.
    prisma.game.findMany({
      where: { ...where, confirmationLeadTime: { not: null } },
      select: { confirmationLeadTime: true },
    }),
    prisma.game.aggregate({ where: { ...where, gamePrice: { not: null } }, _avg: { gamePrice: true } }),
  ]);

  // Por organizador
  const cancelledMap = new Map<string, number>(
    organizerCancelled.map((o) => [o.organizer, Number(o._count._all)])
  );
  const organizerBreakdown: OrganizerBreakdownRow[] = organizerTotals
    .map((o) => {
      const count = Number(o._count._all);
      const cancelled = cancelledMap.get(o.organizer) ?? 0;
      return {
        organizer: o.organizer || "Desconocido",
        count,
        confirmedCount: count - cancelled,
        cancellationRate: count > 0 ? cancelled / count : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  // Satisfacción — promedio ponderado por cantidad de reviews de cada partido
  const totalRatingCount = ratedGames.reduce((s, g) => s + (g.ratingCount ?? 0), 0);
  const avgRating =
    totalRatingCount > 0
      ? ratedGames.reduce((s, g) => s + (g.averageRating ?? 0) * (g.ratingCount ?? 0), 0) / totalRatingCount
      : null;
  const ratingsCoveragePct = totalCount > 0 ? ratedGames.length / totalCount : 0;

  // Dinámica de demanda
  const totalWaitlist = demandAgg._sum.waitlistPlayers ?? 0;
  const totalDropped = demandAgg._sum.droppedPlayers ?? 0;
  const avgPlayersMissing = missingAgg._avg.playersMissing ?? 0;
  const missingGamesCount = Number(missingAgg._count._all);

  // Lead time de confirmación — este campo tiene una cola de valores negativos
  // extremos (hasta -8700) que no representan un lead time real; el promedio
  // simple queda dominado por ese ruido. Usamos la mediana, mucho más robusta.
  const leadTimes = leadTimeRows
    .map((g) => g.confirmationLeadTime as number)
    .sort((a, b) => a - b);
  const medianLeadTime =
    leadTimes.length > 0
      ? leadTimes.length % 2 === 1
        ? leadTimes[(leadTimes.length - 1) / 2]
        : (leadTimes[leadTimes.length / 2 - 1] + leadTimes[leadTimes.length / 2]) / 2
      : null;

  // Precio (distinto de "revenue": esto es lo que se cobra por jugador, más estable)
  const avgPrice = priceAgg._avg.gamePrice ?? null;

  return {
    organizerBreakdown,
    avgRating,
    totalRatingCount,
    ratingsCoveragePct,
    totalWaitlist,
    totalDropped,
    avgPlayersMissing,
    missingGamesCount,
    medianLeadTime,
    avgPrice,
  };
}

export const getExtendedMetrics = cached("getExtendedMetrics", getExtendedMetricsImpl);
