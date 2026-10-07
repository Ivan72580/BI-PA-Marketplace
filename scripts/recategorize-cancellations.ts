/**
 * Re-clasifica las cancelaciones YA cargadas aplicando la regla vigente de
 * scripts/lib/cancellation.ts sobre el texto original (cancellationReasonRaw).
 * Sirve cuando se agrega una categoría o una palabra clave (p. ej. PLUGIN) y no se
 * quiere reimportar todo el CSV.
 *
 * Uso (apuntando a la base que corresponda):
 *   npx tsx scripts/recategorize-cancellations.ts            # simulación: muestra qué cambiaría
 *   npx tsx scripts/recategorize-cancellations.ts --apply    # aplica los cambios
 *
 * Solo toca partidos CANCELADOS con texto de motivo. No cambia ninguna otra columna.
 * Seguro de correr varias veces (es idempotente).
 */
import { PrismaClient } from "@prisma/client";
import { categorizeCancellation } from "./lib/cancellation";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  const groups = (await prisma.game.groupBy({
    by: ["cancellationReasonRaw", "cancellationCategory"],
    where: { status: "CANCELLED" },
    _count: { _all: true },
  })) as unknown as { cancellationReasonRaw: string | null; cancellationCategory: string | null; _count: { _all: number } }[];

  // texto exacto -> categoría nueva, solo donde difiere de la guardada
  const changes = new Map<string, { to: string | null; byFrom: Map<string | null, number> }>();
  for (const g of groups) {
    const target = categorizeCancellation(g.cancellationReasonRaw);
    // Sin texto: no hay con qué decidir, se deja como está.
    if (g.cancellationReasonRaw === null || g.cancellationReasonRaw === "") continue;
    if (target === g.cancellationCategory) continue;
    const key = g.cancellationReasonRaw;
    const e = changes.get(key) ?? { to: target, byFrom: new Map() };
    e.byFrom.set(g.cancellationCategory, (e.byFrom.get(g.cancellationCategory) ?? 0) + g._count._all);
    changes.set(key, e);
  }

  const summary = new Map<string, number>();
  let total = 0;
  for (const [, e] of changes) {
    for (const [from, n] of e.byFrom) {
      const k = `${from ?? "(sin categoría)"} -> ${e.to ?? "(sin categoría)"}`;
      summary.set(k, (summary.get(k) ?? 0) + n);
      total += n;
    }
  }
  console.log(`Cancelaciones que cambiarían de categoría: ${total}`);
  for (const [k, n] of [...summary.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${k}`);

  const sample = [...changes.entries()]
    .map(([raw, e]) => ({ raw, to: e.to, n: [...e.byFrom.values()].reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 15);
  if (sample.length > 0) {
    console.log("\nTextos más frecuentes entre los que cambian:");
    for (const s of sample) console.log(`  ${String(s.n).padStart(6)}  [${s.to}]  ${s.raw}`);
  }

  if (!apply) {
    console.log("\nSimulación: no se escribió nada. Agregá --apply para aplicar.");
    return;
  }
  let updated = 0;
  for (const [raw, e] of changes) {
    const r = await prisma.game.updateMany({
      where: { status: "CANCELLED", cancellationReasonRaw: raw },
      data: { cancellationCategory: e.to as never },
    });
    updated += r.count;
  }
  console.log(`\nAplicado: ${updated} partidos actualizados.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
