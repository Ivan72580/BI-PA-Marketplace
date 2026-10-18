/**
 * Diagnóstico de SOLO LECTURA: ¿cuánto pesan las cancelaciones por "cancha no disponible"
 * (FACILITY_UNAVAILABLE) en el % de confirmación?
 *
 * Compara, por market y por facility:
 *   - tasa cruda      = confirmados / (confirmados + cancelados)
 *   - tasa de demanda = confirmados / (confirmados + cancelados SIN cancha no disponible)
 * y muestra qué textos de cancelación cayeron en cada categoría, para revisar si la clasificación
 * es confiable (cancelaciones "OTHER" o sin motivo que en realidad eran por cancha, y al revés).
 *
 * Uso (apuntando a la base que quieras medir, p. ej. producción con DATABASE_URL en esa terminal):
 *   npx tsx scripts/diagnose-facility-unavailable.ts                 # últimos 90 días
 *   npx tsx scripts/diagnose-facility-unavailable.ts --days 180
 *   npx tsx scripts/diagnose-facility-unavailable.ts --all           # todo el histórico
 *   npx tsx scripts/diagnose-facility-unavailable.ts --out reporte   # prefijo de los CSV (default: facility-unavailable)
 *
 * No escribe nada en la base. Genera <prefijo>-markets.csv y <prefijo>-facilities.csv.
 */
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
const pts = (n: number | null) => (n === null ? "—" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}`);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type Tally = { confirmed: number; cancelled: number; unavailable: number };
const empty = (): Tally => ({ confirmed: 0, cancelled: 0, unavailable: 0 });
const rawRate = (t: Tally) => (t.confirmed + t.cancelled > 0 ? t.confirmed / (t.confirmed + t.cancelled) : null);
const demandRate = (t: Tally) => {
  const d = t.confirmed + t.cancelled - t.unavailable;
  return d > 0 ? t.confirmed / d : null;
};

async function main() {
  const all = process.argv.includes("--all");
  const days = Number(arg("--days") ?? 90);
  const outPrefix = arg("--out") ?? "facility-unavailable";
  const since = all ? undefined : new Date(Date.now() - days * 86400000);
  const where = since ? { date: { gte: since } } : {};
  console.log(`Ventana: ${all ? "todo el histórico" : `últimos ${days} días (desde ${since!.toISOString().slice(0, 10)})`}\n`);

  type FacilityRow = { id: string; name: string; market: { name: string; region: { name: string } } };
  type GroupRow = { facilityId: string; status: string; cancellationCategory: string | null; _count: { _all: number } };
  const [groups, facilities] = (await Promise.all([
    prisma.game.groupBy({ by: ["facilityId", "status", "cancellationCategory"], where, _count: { _all: true } }),
    prisma.facility.findMany({ select: { id: true, name: true, market: { select: { name: true, region: { select: { name: true } } } } } }),
  ])) as unknown as [GroupRow[], FacilityRow[]];
  const fac = new Map(facilities.map((f) => [f.id, f]));

  const byFacility = new Map<string, Tally>();
  const byMarket = new Map<string, Tally>();
  const total = empty();
  const catCount = new Map<string, number>();
  for (const g of groups) {
    const n = g._count._all;
    const f = fac.get(g.facilityId);
    const marketKey = f ? `${f.market.region.name} / ${f.market.name}` : "(sin market)";
    const ft = byFacility.get(g.facilityId) ?? empty();
    const mt = byMarket.get(marketKey) ?? empty();
    for (const t of [ft, mt, total]) {
      if (g.status === "CONFIRMED") t.confirmed += n;
      else {
        t.cancelled += n;
        if (g.cancellationCategory === "FACILITY_UNAVAILABLE") t.unavailable += n;
      }
    }
    if (g.status !== "CONFIRMED") {
      const k = g.cancellationCategory ?? "(sin motivo)";
      catCount.set(k, (catCount.get(k) ?? 0) + n);
    }
    byFacility.set(g.facilityId, ft);
    byMarket.set(marketKey, mt);
  }

  console.log("=== RED COMPLETA ===");
  console.log(`Publicados: ${total.confirmed + total.cancelled} · confirmados: ${total.confirmed} · cancelados: ${total.cancelled}`);
  console.log(`Cancelados por cancha no disponible: ${total.unavailable} (${pct(total.cancelled ? total.unavailable / total.cancelled : null)} de las cancelaciones, ${pct(total.confirmed + total.cancelled ? total.unavailable / (total.confirmed + total.cancelled) : null)} de lo publicado)`);
  console.log(`Confirmación cruda: ${pct(rawRate(total))} · de demanda: ${pct(demandRate(total))} · diferencia: ${pts(demandRate(total) !== null && rawRate(total) !== null ? demandRate(total)! - rawRate(total)! : null)} pts\n`);

  console.log("=== Cancelaciones por categoría ===");
  for (const [k, n] of [...catCount.entries()].sort((a, b) => b[1] - a[1])) console.log(`${k.padEnd(24)} ${String(n).padStart(7)}  ${pct(n / Math.max(1, total.cancelled))}`);

  // Texto crudo de las categorías cuya clasificación conviene auditar.
  for (const cat of ["FACILITY_UNAVAILABLE", "OTHER"] as const) {
    const raws = await prisma.game.groupBy({ by: ["cancellationReasonRaw"], where: { ...where, status: "CANCELLED", cancellationCategory: cat }, _count: { _all: true }, orderBy: { _count: { cancellationReasonRaw: "desc" } }, take: 15 });
    console.log(`\n=== Textos más frecuentes en ${cat} (para revisar la clasificación) ===`);
    for (const r of raws) console.log(`${String(r._count._all).padStart(6)}  ${r.cancellationReasonRaw ?? "(vacío)"}`);
  }

  const marketRows = [...byMarket.entries()]
    .map(([name, t]) => ({ name, t, raw: rawRate(t), dem: demandRate(t) }))
    .map((r) => ({ ...r, delta: r.raw !== null && r.dem !== null ? r.dem - r.raw : null }))
    .sort((a, b) => (b.delta ?? -1) - (a.delta ?? -1));
  console.log("\n=== Por market (ordenado por cuánto sube la tasa al excluir cancha no disponible) ===");
  console.log("market".padEnd(34), "publ.".padStart(6), "c.n.d.".padStart(7), "cruda".padStart(7), "demanda".padStart(8), "dif.pts".padStart(8));
  for (const r of marketRows) {
    console.log(r.name.slice(0, 33).padEnd(34), String(r.t.confirmed + r.t.cancelled).padStart(6), String(r.t.unavailable).padStart(7), pct(r.raw).padStart(7), pct(r.dem).padStart(8), pts(r.delta).padStart(8));
  }

  const facRows = [...byFacility.entries()]
    .map(([id, t]) => ({ id, name: fac.get(id)?.name ?? id, market: fac.get(id)?.market.name ?? "", t, raw: rawRate(t), dem: demandRate(t) }))
    .map((r) => ({ ...r, delta: r.raw !== null && r.dem !== null ? r.dem - r.raw : null }))
    .sort((a, b) => b.t.unavailable - a.t.unavailable);
  console.log("\n=== Top 15 facilities por cantidad de cancelaciones por cancha no disponible ===");
  for (const r of facRows.slice(0, 15)) {
    console.log(`${r.name.slice(0, 40).padEnd(41)} ${r.market.slice(0, 18).padEnd(19)} c.n.d.: ${String(r.t.unavailable).padStart(4)} · cruda ${pct(r.raw)} · demanda ${pct(r.dem)} (${pts(r.delta)} pts)`);
  }
  const affected = facRows.filter((r) => r.t.unavailable > 0).length;
  console.log(`\nFacilities con al menos 1 cancelación por cancha no disponible: ${affected} de ${facRows.length}`);

  writeFileSync(`${outPrefix}-markets.csv`, ["market,publicados,confirmados,cancelados,cancha_no_disponible,tasa_cruda,tasa_demanda,dif_pts", ...marketRows.map((r) => [csv(r.name), r.t.confirmed + r.t.cancelled, r.t.confirmed, r.t.cancelled, r.t.unavailable, r.raw ?? "", r.dem ?? "", r.delta === null ? "" : (r.delta * 100).toFixed(2)].join(","))].join("\n"));
  writeFileSync(`${outPrefix}-facilities.csv`, ["facility,market,publicados,confirmados,cancelados,cancha_no_disponible,tasa_cruda,tasa_demanda,dif_pts", ...facRows.map((r) => [csv(r.name), csv(r.market), r.t.confirmed + r.t.cancelled, r.t.confirmed, r.t.cancelled, r.t.unavailable, r.raw ?? "", r.dem ?? "", r.delta === null ? "" : (r.delta * 100).toFixed(2)].join(","))].join("\n"));
  console.log(`\nCSV escritos: ${outPrefix}-markets.csv y ${outPrefix}-facilities.csv`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
