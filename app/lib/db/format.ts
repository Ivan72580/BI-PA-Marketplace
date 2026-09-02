import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, type OverviewFilters } from "./shared";

// Formatos fijos reconocidos — cualquier Max Players que no coincida exacto
// con uno de estos cae en "Otros". Sin inferencia de torneos/multi-equipo:
// simple y predecible en toda la app.
const FIXED_FORMATS: { maxPlayers: number; label: string }[] = [
  { maxPlayers: 8, label: "4v4" },
  { maxPlayers: 10, label: "5v5" },
  { maxPlayers: 12, label: "6v6" },
  { maxPlayers: 14, label: "7v7" },
  { maxPlayers: 16, label: "8v8" },
  { maxPlayers: 18, label: "9v9" },
  { maxPlayers: 20, label: "10v10" },
  { maxPlayers: 22, label: "11v11" },
  { maxPlayers: 24, label: "12v12" },
];
const FORMAT_LABEL_BY_MAX_PLAYERS = new Map(FIXED_FORMATS.map((f) => [f.maxPlayers, f.label]));
const OTHER_LABEL = "Otros";

export function inferFormat(maxPlayers: number): { label: string } {
  return { label: FORMAT_LABEL_BY_MAX_PLAYERS.get(maxPlayers) ?? OTHER_LABEL };
}

// ---------- Desglose de formatos para un filtro dado ----------

export type FormatBreakdownRow = {
  label: string;
  count: number;
  pct: number;
};

async function getFormatBreakdownImpl(filters: OverviewFilters): Promise<FormatBreakdownRow[]> {
  const where = buildWhere(filters);

  const groups = await prisma.game.groupBy({
    by: ["maxPlayers"],
    where,
    _count: { _all: true },
  });

  const counts = new Map<string, number>();
  let total = 0;
  for (const g of groups) {
    const count = Number(g._count._all);
    total += count;
    const label = inferFormat(g.maxPlayers).label;
    counts.set(label, (counts.get(label) ?? 0) + count);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, pct: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}

export const getFormatBreakdown = cached("getFormatBreakdown", getFormatBreakdownImpl);
