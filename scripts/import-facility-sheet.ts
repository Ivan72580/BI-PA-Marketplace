/**
 * Importa el Sheet "Facility Profile" (Airtable) a FacilityProfile.
 *
 * Uso:
 *   npx tsx scripts/import-facility-sheet.ts sheet.csv                 # dry-run contra la DB, escribe el reporte
 *   npx tsx scripts/import-facility-sheet.ts sheet.csv --apply         # además escribe en la DB
 *   npx tsx scripts/import-facility-sheet.ts sheet.csv --universe-csv events.csv
 *       # dry-run SIN DB: usa Location/Region de un CSV de eventos como universo de facilities
 *
 * Sin --apply nunca escribe. El reporte (facility-sheet-report.csv) lista cada fila del Sheet con
 * su estado de match y los motivos de revisión.
 *
 * Reglas:
 * - "Market" del Sheet = Market de la app (CSV de eventos: "Region"). No es Facility Type.
 * - Match por nombre normalizado (solo alfanumérico) dentro del mismo Market. Si solo coincide en
 *   otro Market se marca "market_distinto" y NO se escribe.
 * - Tarifas: el texto crudo siempre se guarda; los campos tipados solo si el texto es inequívoco.
 * - Nunca pisa tarifas ya verificadas a mano (ratesVerifiedAt) ni campos que ya tienen valor.
 */
import { readFileSync, writeFileSync } from "fs";
import { parse } from "csv-parse/sync";
import {
  normKey, parseTail, parseFacilityTypes, parseAddress, parsePricing,
} from "./lib/facilitySheet";

type Universe = { id: string; name: string; market: string };

// `any` a propósito: el cliente generado de Prisma se instancia recién en la rama de DB (import dinámico
// para que el modo --universe-csv corra sin DB ni `prisma generate`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadUniverse(eventsCsv: string | null): Promise<{ list: Universe[]; db: any | null }> {
  if (eventsCsv) {
    const rows = parse(readFileSync(eventsCsv), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
    const seen = new Map<string, Universe>();
    for (const r of rows) {
      const name = r["Location"]?.trim(), market = r["Region"]?.trim();
      if (!name || !market) continue;
      const k = `${normKey(market)}|${normKey(name)}`;
      if (!seen.has(k)) seen.set(k, { id: k, name, market });
    }
    return { list: [...seen.values()], db: null };
  }
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const fs = (await db.facility.findMany({ select: { id: true, name: true, market: { select: { name: true } } } })) as {
    id: string; name: string; market: { name: string };
  }[];
  return { list: fs.map((f) => ({ id: f.id, name: f.name, market: f.market.name })), db };
}

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ⏎ ")}"`;

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const apply = args.includes("--apply");
  const ui = args.indexOf("--universe-csv");
  const universeCsv = ui >= 0 ? args[ui + 1] : null;
  const ri = args.indexOf("--report");
  const reportPath = ri >= 0 ? args[ri + 1] : "facility-sheet-report.csv";
  if (!file || (apply && universeCsv)) {
    console.error("Uso: tsx scripts/import-facility-sheet.ts sheet.csv [--apply | --universe-csv events.csv] [--report out.csv]");
    process.exit(1);
  }

  const raw = parse(readFileSync(file), { columns: false, relax_column_count: true, skip_empty_lines: true }) as string[][];
  const rows = raw.slice(1);
  const { list, db } = await loadUniverse(universeCsv);

  const byMarketName = new Map<string, Universe[]>();
  const byName = new Map<string, Universe[]>();
  for (const u of list) {
    const k1 = `${normKey(u.market)}|${normKey(u.name)}`;
    byMarketName.set(k1, [...(byMarketName.get(k1) ?? []), u]);
    byName.set(normKey(u.name), [...(byName.get(normKey(u.name)) ?? []), u]);
  }

  const report: string[] = [["fila", "facility", "market", "match", "db_facility", "db_market", "modelo", "tarifa", "unidad", "share_plei_pct", "indoor_outdoor", "tipos", "ciudad", "estado", "zip", "activo", "sugerencia_match", "motivos_revision", "texto_tarifa"].map(csvCell).join(",")];
  const counts: Record<string, number> = {};
  const seenSheetKeys = new Set<string>();
  let applied = 0;

  for (let i = 0; i < rows.length; i++) {
    const [name = "", market = "", ftype = "", pricing = "", address = "", ...rest] = rows[i].map((c) => c ?? "");
    const n = name.trim();
    const flags: string[] = [];
    if (!n) {
      counts.sin_nombre = (counts.sin_nombre ?? 0) + 1;
      report.push([i + 2, "", market, "sin_nombre", "", "", "", "", "", "", "", "", "", "", "", "", "", "fila sin nombre de facility", pricing].map(csvCell).join(","));
      continue;
    }

    const key = `${normKey(market)}|${normKey(n)}`;
    if (seenSheetKeys.has(key)) flags.push("nombre duplicado en el Sheet (misma facility+market)");
    seenSheetKeys.add(key);

    let match = "sin_match";
    let hit: Universe | null = null;
    const exact = byMarketName.get(key) ?? [];
    if (exact.length === 1) { match = "ok"; hit = exact[0]; }
    else if (exact.length > 1) { match = "ambiguo"; }
    else {
      const other = byName.get(normKey(n)) ?? [];
      if (other.length === 1) { match = "market_distinto"; hit = other[0]; flags.push(`existe en el market "${other[0].market}"`); }
      else if (other.length > 1) match = "ambiguo";
    }
    counts[match] = (counts[match] ?? 0) + 1;
    // Para los sin match: candidatos del mismo market cuyo nombre contiene al
    // del Sheet (o al revés), o que coinciden en el nombre antes de " | ".
    let suggestion = "";
    if (match === "sin_match") {
      const nk = normKey(n), base = normKey(n.split("|")[0]);
      const cands = list.filter((u) => normKey(u.market) === normKey(market) && (() => {
        const uk = normKey(u.name), ub = normKey(u.name.split("|")[0]);
        return uk.includes(nk) || nk.includes(uk) || (base.length >= 5 && (ub === base || uk.includes(base) || base.includes(uk)));
      })());
      suggestion = cands.slice(0, 3).map((u) => u.name).join(" ; ");
    }

    const tail = parseTail(rest);
    const addr = parseAddress(address);
    const price = parsePricing(pricing);
    const types = parseFacilityTypes(ftype);
    flags.push(...tail.flags, ...addr.flags.filter((f) => f !== "sin dirección" || !tail.website), ...price.flags);
    if (/\bqa\b|test/i.test(n)) flags.push("parece facility de prueba/QA");

    report.push([
      i + 2, n, market, match, hit?.name ?? "", hit?.market ?? "",
      price.model ?? "", price.fixedRate ?? "", price.rateUnit ?? "", price.revenueSharePct ?? "",
      tail.indoorOutdoor ?? "", types.join(" ; "), addr.city ?? "", addr.state ?? "", addr.postalCode ?? "",
      tail.isActive ? "si" : "no", suggestion, flags.join(" | "), pricing,
    ].map(csvCell).join(","));

    if (apply && db && match === "ok" && hit) {
      const existing = (await db.facilityProfile.findUnique({ where: { facilityId: hit.id } })) as Record<string, unknown> | null;
      const verified = existing?.ratesVerifiedAt != null;
      const fill = (field: string, value: unknown) =>
        value === null || value === undefined || (Array.isArray(value) && value.length === 0) || (existing && existing[field] != null && !(Array.isArray(existing[field]) && (existing[field] as unknown[]).length === 0))
          ? {} : { [field]: value };
      const data = {
        ...fill("address", addr.address), ...fill("city", addr.city), ...fill("state", addr.state),
        ...fill("postalCode", addr.postalCode), ...fill("website", tail.website),
        ...fill("indoorOutdoor", tail.indoorOutdoor), ...fill("facilityTypes", types),
        ...fill("isActive", tail.isActive),
        ...(verified ? {} : {
          pricingRawText: pricing.trim() || null,
          ...fill("pricingModel", price.model), ...fill("fixedRate", price.fixedRate),
          ...fill("rateUnit", price.rateUnit), ...fill("revenueSharePct", price.revenueSharePct),
        }),
      };
      await db.facilityProfile.upsert({ where: { facilityId: hit.id }, create: { facilityId: hit.id, ...data }, update: data });
      applied++;
    }
  }

  writeFileSync(reportPath, report.join("\n"), "utf8");
  console.log(`Filas del Sheet: ${rows.length}`);
  console.log("Resultado de match:", counts);
  console.log(apply ? `Perfiles escritos: ${applied}` : "Dry-run: no se escribió nada en la DB.");
  console.log(`Reporte: ${reportPath}`);
  if (db) await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
