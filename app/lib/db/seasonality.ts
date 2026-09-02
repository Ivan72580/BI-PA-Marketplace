import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, type OverviewFilters } from "./shared";

export type MonthlyPoint = {
  month: string; // "YYYY-MM"
  revenue: number;
  confirmedGames: number;
  confirmationRate: number;
  cancellationRate: number;
};

async function getSeasonalityDataImpl(filters: Omit<OverviewFilters, "dateFrom" | "dateTo">) {
  const where = buildWhere(filters);

  const games = await prisma.game.findMany({
    where,
    select: { date: true, status: true, eventRevenue: true },
  });

  const monthlyMap = new Map<string, { revenue: number; confirmed: number; cancelled: number }>();
  for (const g of games) {
    const key = `${g.date.getUTCFullYear()}-${String(g.date.getUTCMonth() + 1).padStart(2, "0")}`;
    const entry = monthlyMap.get(key) ?? { revenue: 0, confirmed: 0, cancelled: 0 };
    if (g.status === "CONFIRMED") {
      entry.confirmed += 1;
      entry.revenue += g.eventRevenue ?? 0;
    } else {
      entry.cancelled += 1;
    }
    monthlyMap.set(key, entry);
  }

  const months = Array.from(monthlyMap.keys()).sort();
  const series: MonthlyPoint[] = months.map((key) => {
    const m = monthlyMap.get(key)!;
    const total = m.confirmed + m.cancelled;
    return {
      month: key,
      revenue: Math.round(m.revenue),
      confirmedGames: m.confirmed,
      confirmationRate: total > 0 ? m.confirmed / total : 0,
      cancellationRate: total > 0 ? m.cancelled / total : 0,
    };
  });

  const currentPeriod = series.slice(-12);
  const priorPeriod = series.slice(-24, -12);

  const overlay = currentPeriod.map((point, idx) => {
    const priorPoint = priorPeriod[idx];
    return {
      month: point.month,
      priorMonth: priorPoint?.month ?? null,
      currentRevenue: point.revenue,
      priorRevenue: priorPoint?.revenue ?? null,
      currentConfirmedGames: point.confirmedGames,
      priorConfirmedGames: priorPoint?.confirmedGames ?? null,
      currentCancellationRate: point.cancellationRate,
      priorCancellationRate: priorPoint?.cancellationRate ?? null,
    };
  });

  const lastMonth = series[series.length - 1] ?? null;
  let yoy: {
    month: string;
    revenueChangePct: number | null;
    confirmedChangePct: number | null;
    confirmationRatePointsChange: number | null;
    cancellationRatePointsChange: number | null;
  } | null = null;

  if (lastMonth) {
    const [year, month] = lastMonth.month.split("-").map(Number);
    const priorYearKey = `${year - 1}-${String(month).padStart(2, "0")}`;
    const priorYearPoint = series.find((s) => s.month === priorYearKey) ?? null;

    if (priorYearPoint) {
      yoy = {
        month: lastMonth.month,
        revenueChangePct:
          priorYearPoint.revenue > 0
            ? (lastMonth.revenue - priorYearPoint.revenue) / priorYearPoint.revenue
            : null,
        confirmedChangePct:
          priorYearPoint.confirmedGames > 0
            ? (lastMonth.confirmedGames - priorYearPoint.confirmedGames) / priorYearPoint.confirmedGames
            : null,
        confirmationRatePointsChange:
          lastMonth.confirmationRate - priorYearPoint.confirmationRate,
        cancellationRatePointsChange:
          lastMonth.cancellationRate - priorYearPoint.cancellationRate,
      };
    }
  }

  const insights = generateSeasonalityInsights(yoy);

  return { series, overlay, yoy, insights };
}

export const getSeasonalityData = cached("getSeasonalityData", getSeasonalityDataImpl);

function generateSeasonalityInsights(
  yoy: {
    month: string;
    revenueChangePct: number | null;
    confirmedChangePct: number | null;
    confirmationRatePointsChange: number | null;
    cancellationRatePointsChange: number | null;
  } | null
): string[] {
  if (!yoy) {
    return ["Todavía no hay un año completo de historial para comparar interanualmente."];
  }

  const insights: string[] = [];
  const REVENUE_THRESHOLD = 0.15;
  const CANCELLATION_THRESHOLD = 0.05;

  if (yoy.revenueChangePct !== null && Math.abs(yoy.revenueChangePct) >= REVENUE_THRESHOLD) {
    const dir = yoy.revenueChangePct > 0 ? "subió" : "bajó";
    insights.push(
      `${yoy.revenueChangePct > 0 ? "✓" : "⚠"} El revenue de ${yoy.month} ${dir} ${Math.abs(yoy.revenueChangePct * 100).toFixed(1)}% vs. el mismo mes del año anterior.`
    );
  }

  if (yoy.cancellationRatePointsChange !== null && Math.abs(yoy.cancellationRatePointsChange) >= CANCELLATION_THRESHOLD) {
    const dir = yoy.cancellationRatePointsChange > 0 ? "aumentó" : "bajó";
    insights.push(
      `${yoy.cancellationRatePointsChange > 0 ? "⚠" : "✓"} La tasa de cancelación ${dir} ${Math.abs(yoy.cancellationRatePointsChange * 100).toFixed(1)} puntos vs. el mismo mes del año anterior.`
    );
  }

  if (insights.length === 0) {
    insights.push(`Sin cambios interanuales significativos en ${yoy.month} respecto al año anterior.`);
  }

  return insights;
}
