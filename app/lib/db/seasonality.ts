import { GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, type OverviewFilters } from "./shared";

// ---------- Estacionalidad: volumen y revenue mes a mes, año vs año anterior ----------
//
// Reemplaza la versión anterior de este archivo (nunca enlazada a ninguna
// página — cero callers fuera de este módulo, confirmado antes de reescribir)
// que traía con un solo findMany TODO el historial de Game sin acotar fecha,
// el mismo riesgo de sobreconsumo de memoria/egress de Neon ya corregido en
// satisfaction.ts/contribution.ts/forecast.ts. Acá se acota de entrada a
// exactamente los 24 meses relevantes: el año pedido + el año anterior
// completo (la única comparación que necesita esta página — YoY, mes contra
// el mismo mes del año anterior, no contra el mes previo).
//
// Solo cuenta partidos CONFIRMED: el pedido es "volumen (partidos
// confirmados)", no confirmación/cancelación — filtrar por status en el
// WHERE (no en JS después) también reduce lo que viaja desde la base.

export type SeasonalityMonthPoint = {
  monthIndex: number; // 0 = enero … 11 = diciembre
  confirmedGames: number;
  revenue: number; // suma simple de eventRevenue, sin deducir costos
};

export type SeasonalityYearData = {
  year: number;
  months: SeasonalityMonthPoint[]; // 12 posiciones, año pedido, siempre completas (0 si no hubo partidos)
  priorMonths: SeasonalityMonthPoint[]; // 12 posiciones, año pedido - 1
  totalConfirmedGames: number;
  totalConfirmedGamesPrior: number;
  totalRevenue: number;
  totalRevenuePrior: number;
};

function emptyMonths(): SeasonalityMonthPoint[] {
  return Array.from({ length: 12 }, (_, monthIndex) => ({ monthIndex, confirmedGames: 0, revenue: 0 }));
}

async function getSeasonalityDataImpl(
  filters: Omit<OverviewFilters, "dateFrom" | "dateTo">,
  year: number
): Promise<SeasonalityYearData> {
  const dateFrom = new Date(Date.UTC(year - 1, 0, 1));
  const dateTo = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const where = buildWhere({ ...filters, dateFrom, dateTo });

  const games = await prisma.game.findMany({
    where: { ...where, status: GameStatus.CONFIRMED },
    select: { date: true, eventRevenue: true },
  });

  const months = emptyMonths();
  const priorMonths = emptyMonths();

  for (const g of games) {
    const gYear = g.date.getUTCFullYear();
    const gMonth = g.date.getUTCMonth();
    const bucket = gYear === year ? months : gYear === year - 1 ? priorMonths : null;
    if (!bucket) continue; // no debería pasar: el where ya acota a estos 24 meses
    bucket[gMonth].confirmedGames += 1;
    bucket[gMonth].revenue += g.eventRevenue ?? 0;
  }

  const sum = (pts: SeasonalityMonthPoint[], key: "confirmedGames" | "revenue") => pts.reduce((s, p) => s + p[key], 0);

  return {
    year,
    months,
    priorMonths,
    totalConfirmedGames: sum(months, "confirmedGames"),
    totalConfirmedGamesPrior: sum(priorMonths, "confirmedGames"),
    totalRevenue: sum(months, "revenue"),
    totalRevenuePrior: sum(priorMonths, "revenue"),
  };
}

export const getSeasonalityData = cached("getSeasonalityData", getSeasonalityDataImpl);
