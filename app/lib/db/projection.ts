import { prisma } from "./prisma";
import { cached } from "./cache";
import { bucketOf } from "../metrics";
import { average, buildWhere, stdDev, type OverviewFilters } from "./shared";
import { nowInBusinessTimeZone } from "../period";
import type { Locale } from "@/i18n/config";

// `locale` con default "es" — mismo criterio que el resto de esta ronda: el
// único caller de este momento (app/page.tsx, Overview) ya resuelve el
// locale real vía getLocale() y lo pasa.
// Ritmo por día de la semana: en vez de repartir lo acumulado parejo entre todos los días del mes
// (regla de 3, que ignora qué días de la semana faltan), se proyecta lo ya confirmado MÁS lo
// esperado en cada día restante, según el promedio de ese mismo día de la semana en las últimas
// HISTORY_WEEKS semanas. La banda (±1σ) suma las varianzas diarias de los días que faltan.
// Con menos de MIN_HISTORY_DAYS de historia se cae a la regla de 3 y se rotula como tal.
const HISTORY_WEEKS = 8;
const MIN_HISTORY_DAYS = 28;
const DAY_MS = 86400000;

export type ProjectionMethod = "weekday" | "ruleOf3";

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

  let projectedGames: number | null = available ? Math.round((confirmedSoFar / daysElapsed) * daysInMonth) : null;
  let projectedRevenue: number | null = available ? (revenueSoFar / daysElapsed) * daysInMonth : null;
  let projectedGamesLow: number | null = null;
  let projectedGamesHigh: number | null = null;
  let projectedRevenueLow: number | null = null;
  let projectedRevenueHigh: number | null = null;
  let method: ProjectionMethod = "ruleOf3";

  if (available) {
    const lastDay = new Date(Date.UTC(year, month, daysElapsed));
    const histFrom = new Date(lastDay.getTime() - (HISTORY_WEEKS * 7 - 1) * DAY_MS);
    const histRows = (await prisma.game.groupBy({
      by: ["date"],
      where: { ...buildWhere({ ...filters, dateFrom: histFrom, dateTo: lastDay }), status: "CONFIRMED" },
      _count: { _all: true },
    })) as unknown as { date: Date; _count: { _all: number } }[];

    if (histRows.length > 0) {
      const byISO = new Map(histRows.map((r) => [r.date.toISOString().slice(0, 10), Number(r._count._all)]));
      const firstSeen = histRows.reduce((mn, r) => Math.min(mn, r.date.getTime()), Infinity);
      const start = Math.max(histFrom.getTime(), firstSeen);
      const spanDays = Math.floor((lastDay.getTime() - start) / DAY_MS) + 1;
      if (spanDays >= MIN_HISTORY_DAYS) {
        // Un día sin ninguna fila confirmada cuenta como 0 (la facility no operó o no se confirmó nada).
        const byWeekday: number[][] = Array.from({ length: 7 }, () => []);
        for (let t = start; t <= lastDay.getTime(); t += DAY_MS) {
          const d = new Date(t);
          byWeekday[d.getUTCDay()].push(byISO.get(d.toISOString().slice(0, 10)) ?? 0);
        }
        let expectedRemaining = 0;
        let varianceRemaining = 0;
        for (let day = daysElapsed + 1; day <= daysInMonth; day++) {
          const vals = byWeekday[new Date(Date.UTC(year, month, day)).getUTCDay()];
          expectedRemaining += average(vals);
          varianceRemaining += stdDev(vals) ** 2;
        }
        const sd = Math.sqrt(varianceRemaining);
        const perConfirmed = confirmedSoFar > 0 ? revenueSoFar / confirmedSoFar : 0;
        const point = confirmedSoFar + expectedRemaining;
        projectedGames = Math.round(point);
        projectedGamesLow = Math.max(confirmedSoFar, Math.round(point - sd));
        projectedGamesHigh = Math.round(point + sd);
        projectedRevenue = revenueSoFar + expectedRemaining * perConfirmed;
        projectedRevenueLow = revenueSoFar + Math.max(0, expectedRemaining - sd) * perConfirmed;
        projectedRevenueHigh = revenueSoFar + (expectedRemaining + sd) * perConfirmed;
        method = "weekday";
      }
    }
  }

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
    projectedGamesLow,
    projectedGamesHigh,
    projectedRevenueLow,
    projectedRevenueHigh,
    method,
    priorConfirmedGames,
    priorRevenue,
    changePctGames,
    changePctRevenue,
    monthLabel,
    availableFromDay: 8,
  };
}

export const getMonthProjection = cached("getMonthProjection", getMonthProjectionImpl);
