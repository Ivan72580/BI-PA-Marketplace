import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, labelForCancellationCategory, type OverviewFilters } from "./shared";
import { buildContribution, type ContribGame, type ContributionReport } from "../reportContribution";
import type { Locale } from "@/i18n/config";

// Una sola lectura de los partidos del período (columnas mínimas) y el resto se agrega en memoria; el período anterior
// solo aporta los confirmados por facility para la variación.
type Filters = Omit<OverviewFilters, "dateFrom" | "dateTo">;

export type ContributionPayload = ContributionReport & { categoryLabels: Record<string, string> };

async function impl(filters: Filters, from: Date, to: Date, priorFrom: Date, priorTo: Date, locale: Locale): Promise<ContributionPayload> {
  const where = buildWhere({ ...filters, dateFrom: from, dateTo: to });
  const priorWhere = buildWhere({ ...filters, dateFrom: priorFrom, dateTo: priorTo });
  const [games, priorGroups] = await Promise.all([
    prisma.game.findMany({ where, select: { facilityId: true, fieldName: true, dayOfWeek: true, time: true, status: true, cancellationCategory: true } }),
    prisma.game.groupBy({ by: ["facilityId"], where: { ...priorWhere, status: "CONFIRMED" }, _count: { _all: true } }),
  ]);
  const rows = games as unknown as ContribGame[];
  const ids = [...new Set(rows.map((g) => g.facilityId))];
  const facilities = (ids.length
    ? await prisma.facility.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, market: { select: { name: true } } } })
    : []) as { id: string; name: string; market: { name: string } }[];
  const info = new Map(facilities.map((f) => [f.id, { name: f.name, market: f.market.name }]));
  const prior = new Map((priorGroups as unknown as { facilityId: string; _count: { _all: number } }[]).map((g): [string, number] => [g.facilityId, Number(g._count._all)]));
  const report = buildContribution(rows, info, prior);

  const cats = new Set<string>();
  for (const c of report.cancellations) for (const r of c.reasons) cats.add(r.category);
  for (const s of report.criticalSlots) if (s.dominantCategory) cats.add(s.dominantCategory);
  for (const f of report.criticalFacilities) if (f.dominantCategory) cats.add(f.dominantCategory);
  const categoryLabels: Record<string, string> = {};
  for (const c of cats) categoryLabels[c] = c === "NONE" ? (locale === "en" ? "No reason recorded" : "Sin motivo cargado") : labelForCancellationCategory(c, locale);
  return { ...report, categoryLabels };
}

export const getContributionReport = cached("getContributionReport", impl);
