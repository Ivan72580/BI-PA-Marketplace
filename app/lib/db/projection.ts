import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, type OverviewFilters } from "./shared";

async function getMonthProjectionImpl(filters: Omit<OverviewFilters, "dateFrom" | "dateTo">) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1));
  const daysElapsed = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const where = buildWhere({ ...filters, dateFrom: monthStart, dateTo: now });
  const games = await prisma.game.findMany({ where, select: { status: true, eventRevenue: true } });

  const confirmedSoFar = games.filter((g) => g.status === "CONFIRMED").length;
  const cancelledSoFar = games.filter((g) => g.status === "CANCELLED").length;
  const totalSoFar = confirmedSoFar + cancelledSoFar;
  const confirmationRateSoFar = totalSoFar > 0 ? confirmedSoFar / totalSoFar : null;
  const cancellationRateSoFar = totalSoFar > 0 ? cancelledSoFar / totalSoFar : null;
  const revenueSoFar = games
    .filter((g) => g.status === "CONFIRMED")
    .reduce((s, g) => s + (g.eventRevenue ?? 0), 0);

  // No proyectamos con menos de una semana de datos: muy poco volumen,
  // demasiado ruido para que la regla de 3 signifique algo.
  const available = daysElapsed > 7;

  const projectedGames = available ? Math.round((confirmedSoFar / daysElapsed) * daysInMonth) : null;
  const projectedRevenue = available ? (revenueSoFar / daysElapsed) * daysInMonth : null;

  const monthLabel = monthStart.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });

  return {
    available,
    daysElapsed,
    daysInMonth,
    totalSoFar,
    confirmedSoFar,
    cancelledSoFar,
    confirmationRateSoFar,
    cancellationRateSoFar,
    revenueSoFar,
    projectedGames,
    projectedRevenue,
    monthLabel,
    availableFromDay: 8,
  };
}

export const getMonthProjection = cached("getMonthProjection", getMonthProjectionImpl);
