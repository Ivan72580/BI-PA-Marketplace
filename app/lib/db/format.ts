import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, type OverviewFilters } from "./shared";

// Formatos fijos reconocidos — se usan solo como FALLBACK para filas
// importadas antes de que el CSV tuviera la columna "Game Size" (dato
// directo). Con el dato real disponible, ya no hace falta inferir a partir
// de Max Players en la gran mayoría de los casos.
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

// Combina el tamaño real (Game Size del CSV, con fallback a la inferencia
// por Max Players solo si falta) con el tipo/nombre de cancha (Field, ya
// filtrado para quedarse solo con lo que tiene especificidad real) — ej:
// "Indoor 7v7", "Turf Field 6v6", o simplemente "7v7" cuando la cancha no
// tiene un tipo/nombre específico.
export function combineFormatLabel(gameSize: string | null | undefined, fieldType: string | null | undefined, maxPlayers: number): string {
  const size = gameSize && gameSize.trim() ? gameSize.trim() : inferFormat(maxPlayers).label;
  return fieldType && fieldType.trim() ? `${fieldType.trim()} ${size}` : size;
}

// ---------- Desglose de formatos para un filtro dado ----------

export type FormatBreakdownRow = {
  label: string;
  count: number;
  pct: number;
};

async function getFormatBreakdownImpl(filters: OverviewFilters): Promise<FormatBreakdownRow[]> {
  const where = buildWhere(filters);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups = (await (prisma.game.groupBy as any)({
    by: ["gameSize", "fieldType", "maxPlayers"],
    where,
    _count: { _all: true },
  })) as { gameSize: string | null; fieldType: string | null; maxPlayers: number; _count: { _all: number } }[];

  const counts = new Map<string, number>();
  let total = 0;
  for (const g of groups) {
    const count = Number(g._count._all);
    total += count;
    const label = combineFormatLabel(g.gameSize, g.fieldType, g.maxPlayers);
    counts.set(label, (counts.get(label) ?? 0) + count);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, pct: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}

export const getFormatBreakdown = cached("getFormatBreakdown", getFormatBreakdownImpl);
