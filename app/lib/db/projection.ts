import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, type OverviewFilters } from "./shared";
import { nowInBusinessTimeZone } from "../period";
import type { Locale } from "@/i18n/config";

// `locale` con default "es" — mismo criterio que el resto de esta ronda: el
// único caller de este momento (app/page.tsx, Overview) ya resuelve el
// locale real vía getLocale() y lo pasa.
async function getMonthProjectionImpl(filters: Omit<OverviewFilters, "dateFrom" | "dateTo">, locale: Locale = "es") {
  const now = nowInBusinessTimeZone();
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

  // Mes anterior COMPLETO (no proyectado, ya cerrado) — la base de
  // comparación para la variación %. Mismos filtros, sin fecha, un mes
  // calendario atrás.
  const priorMonthAnchor = new Date(Date.UTC(year, month - 1, 1));
  const priorMonthStart = new Date(Date.UTC(priorMonthAnchor.getUTCFullYear(), priorMonthAnchor.getUTCMonth(), 1));
  const priorMonthEnd = new Date(Date.UTC(priorMonthAnchor.getUTCFullYear(), priorMonthAnchor.getUTCMonth() + 1, 0, 23, 59, 59));
  const priorWhere = buildWhere({ ...filters, dateFrom: priorMonthStart, dateTo: priorMonthEnd });
  const priorGames = await prisma.game.findMany({ where: priorWhere, select: { status: true, eventRevenue: true } });
  const priorConfirmedGames = priorGames.filter((g) => g.status === "CONFIRMED").length;
  const priorRevenue = priorGames
    .filter((g) => g.status === "CONFIRMED")
    .reduce((s, g) => s + (g.eventRevenue ?? 0), 0);

  const changePctGames =
    available && projectedGames !== null && priorConfirmedGames > 0 ? (projectedGames - priorConfirmedGames) / priorConfirmedGames : null;
  const changePctRevenue =
    available && projectedRevenue !== null && priorRevenue > 0 ? (projectedRevenue - priorRevenue) / priorRevenue : null;

  const monthLabel = monthStart.toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { month: "long", year: "numeric", timeZone: "UTC" });

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
    priorConfirmedGames,
    priorRevenue,
    changePctGames,
    changePctRevenue,
    monthLabel,
    availableFromDay: 8,
  };
}

export const getMonthProjection = cached("getMonthProjection", getMonthProjectionImpl);
