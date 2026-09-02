import { CancellationCategory } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, labelForCancellationCategory, sortHoursByOperatingDay, DAY_ORDER, DAY_LABEL_ES, type OverviewFilters } from "./shared";

export type HeatmapReason = { label: string; count: number };

export type HeatmapCell = {
  day: string;
  dayLabel: string;
  hour: string;
  count: number;
  cancelledCount: number;
  cancellationRate: number;
  reasonBreakdown: HeatmapReason[];
};

async function getDayHourHeatmapImpl(filters: OverviewFilters) {
  const where = buildWhere(filters);
  const games = await prisma.game.findMany({
    where,
    select: { dayOfWeek: true, time: true, status: true, cancellationCategory: true },
  });

  const map = new Map<string, { count: number; cancelled: number; reasons: Map<string, number> }>();
  const hoursSet = new Set<string>();

  for (const g of games) {
    const day = g.dayOfWeek?.trim();
    const hour = g.time?.slice(0, 2);
    if (!day || !hour) continue;
    hoursSet.add(hour);
    const key = `${day}|${hour}`;
    const entry = map.get(key) ?? { count: 0, cancelled: 0, reasons: new Map<string, number>() };
    entry.count += 1;
    if (g.status === "CANCELLED") {
      entry.cancelled += 1;
      const cat = g.cancellationCategory ?? CancellationCategory.OTHER;
      entry.reasons.set(cat, (entry.reasons.get(cat) ?? 0) + 1);
    }
    map.set(key, entry);
  }

  const hours = sortHoursByOperatingDay(Array.from(hoursSet));
  let maxCount = 0;

  const cells: HeatmapCell[] = [];
  for (const day of DAY_ORDER) {
    for (const hour of hours) {
      const entry = map.get(`${day}|${hour}`) ?? { count: 0, cancelled: 0, reasons: new Map<string, number>() };
      maxCount = Math.max(maxCount, entry.count);
      const reasonBreakdown = Array.from(entry.reasons.entries())
        .map(([category, count]) => ({ label: labelForCancellationCategory(category), count }))
        .sort((a, b) => b.count - a.count);
      cells.push({
        day,
        dayLabel: DAY_LABEL_ES[day] ?? day,
        hour: `${hour}h`,
        count: entry.count,
        cancelledCount: entry.cancelled,
        cancellationRate: entry.count > 0 ? entry.cancelled / entry.count : 0,
        reasonBreakdown,
      });
    }
  }

  return {
    days: DAY_ORDER.map((d) => DAY_LABEL_ES[d] ?? d),
    hours: hours.map((h) => `${h}h`),
    cells,
    maxCount,
  };
}

export const getDayHourHeatmap = cached("getDayHourHeatmap", getDayHourHeatmapImpl);
