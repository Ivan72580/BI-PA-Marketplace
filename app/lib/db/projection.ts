import { prisma } from "./prisma";
import { cached } from "./cache";
import { bucketOf } from "../metrics";
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
  const todayDay = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const where = buildWhere({ ...filters, dateFrom: monthStart, dateTo: now });
  const games = await prisma.game.findMany({ where, select: { status: true, cancellationCategory: true, eventRevenue: true, date: true } });

  // Días con datos reales: hasta el último partido registrado del mes (el export no
  // trae partidos de hoy). Dividir por el día calendario de hoy contaba un día
  // sin datos y subestimaba la proyección. Sin partidos, cae al día de hoy.
  const lastDataDay = games.reduce((mx, g) => Math.max(mx, g.date.getUTCDate()), 0);
  const daysElapsed = lastDataDay > 0 ? Math.min(lastDataDay, todayDay) : todayDay;

  const confirmedSoFar = games.filter((g) => g.status === "CONFIRMED").length;
  const cancelledSoFar = games.filter((g) => g.status === "CANCELLED").length;
  const totalSoFar = confirmedSoFar + cancelledSoFar;
  // Tasa de DEMANDA (definición única, ver metrics.ts): las cancelaciones por cancha no disponible,
  // operativas y plugin no entran al denominador. totalSoFar sigue siendo lo publicado.
  const demandCancelledSoFar = games.filter((g) => g.status === "CANCELLED" && bucketOf(g.cancellationCategory) === "demand").length;
  const demandBaseSoFar = confirmedSoFar + demandCancelledSoFar;
  const confirmationRateSoFar = demandBaseSoFar > 0 ? confirmedSoFar / demandBaseSoFar : null;
  const cancellationRateSoFar = demandBaseSoFar > 0 ? demandCancelledSoFar / demandBaseSoFar : null;
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
