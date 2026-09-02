import { GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, MAX_NAMED_SEGMENTS, type OverviewFilters } from "./shared";

export type CompositionSegment = { label: string; count: number };

async function getConfirmedCompositionImpl(
  filters: OverviewFilters
): Promise<{ segments: CompositionSegment[]; total: number }> {
  const where = buildWhere(filters);

  const groups = await prisma.game.groupBy({
    by: ["facilityId"],
    where: { ...where, status: GameStatus.CONFIRMED },
    _count: { _all: true },
  });

  type FacilityNameInfo = { id: string; name: string };
  const facilityIds = groups.map((g) => g.facilityId);
  const facilityInfoRows = (await prisma.facility.findMany({
    where: { id: { in: facilityIds } },
    select: { id: true, name: true },
  })) as FacilityNameInfo[];
  const nameMap = new Map(facilityInfoRows.map((f): [string, string] => [f.id, f.name]));

  const sorted = groups
    .map((g) => ({ name: nameMap.get(g.facilityId) ?? "—", count: Number(g._count._all) }))
    .sort((a, b) => b.count - a.count);
  const total = sorted.reduce((s, f) => s + f.count, 0);

  // A diferencia del ranking Top 10, acá no hay tope fijo: se van nombrando
  // facilities de mayor a menor volumen hasta cubrir el 80% del total, y el
  // resto (aunque sean 300 facilities chicas) se agrupa en un solo "Otros".
  const segments: CompositionSegment[] = [];
  let cumulative = 0;
  let i = 0;
  for (; i < sorted.length && i < MAX_NAMED_SEGMENTS; i++) {
    if (total > 0 && cumulative / total >= 0.8) break;
    segments.push({ label: sorted[i].name, count: sorted[i].count });
    cumulative += sorted[i].count;
  }

  const othersCount = total - cumulative;
  if (othersCount > 0) {
    segments.push({ label: "Otros", count: othersCount });
  }

  return { segments, total };
}

export const getConfirmedComposition = cached("getConfirmedComposition", getConfirmedCompositionImpl);
