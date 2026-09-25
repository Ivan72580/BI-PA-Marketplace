/**
 * Mezcla un CSV recién descargado sobre un "archivo madre" persistente en
 * disco (data/*.csv, versionado — bueno, `data/*.csv` está en .gitignore,
 * ver nota abajo), en vez de simplemente pisarlo. Pensado para fuentes que
 * pueden llegar como una exportación histórica completa una vez, y después
 * como exportaciones más chicas por rango de fecha — pisar el archivo con
 * la más chica perdería el historial que sólo vivía en el archivo madre.
 *
 * Regla, por fila del archivo nuevo, según su `key`:
 *   - Ya existe en el archivo madre → se actualiza con los datos nuevos
 *     (por si algo cambió, ej. una respuesta agregada después).
 *   - No existe todavía → se agrega.
 * Una fila que estaba en el archivo madre y no aparece en el archivo nuevo
 * (típico de una exportación incremental más chica) queda como está — este
 * script nunca borra filas del archivo madre.
 *
 * Nota sobre .gitignore: `/data/*.csv` no se versiona (son datos
 * operativos, no código) — el "archivo madre" vive solo en la máquina
 * donde corre auto-import.ts, no en el repo. Si en algún momento hace
 * falta tenerlo en Main como respaldo, es una decisión aparte (sacarlo del
 * .gitignore), no algo que este script decida por su cuenta.
 */
import fs from "fs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export type MergeResult = { added: number; updated: number; unchanged: number; total: number };

export function mergeCsvIntoMaster(newFilePath: string, masterPath: string, keyFn: (row: Record<string, string>) => string): MergeResult {
  const newRows: Record<string, string>[] = parse(fs.readFileSync(newFilePath, "utf-8"), { columns: true, skip_empty_lines: true });

  const hasMaster = fs.existsSync(masterPath);
  const masterRows: Record<string, string>[] = hasMaster
    ? parse(fs.readFileSync(masterPath, "utf-8"), { columns: true, skip_empty_lines: true })
    : [];

  const byKey = new Map<string, Record<string, string>>();
  for (const row of masterRows) byKey.set(keyFn(row), row);

  let added = 0;
  let updated = 0;
  for (const row of newRows) {
    const key = keyFn(row);
    if (byKey.has(key)) updated++;
    else added++;
    byKey.set(key, row);
  }
  const unchanged = masterRows.length - updated;

  // Todas las filas (viejas sin tocar + actualizadas + nuevas) usan las
  // columnas del archivo nuevo como referencia de orden — si el master no
  // existía todavía, son las únicas columnas que hay.
  const columns = newRows[0] ? Object.keys(newRows[0]) : masterRows[0] ? Object.keys(masterRows[0]) : [];
  const merged = Array.from(byKey.values());
  const csv = stringify(merged, { header: true, columns });
  fs.writeFileSync(masterPath, csv);

  return { added, updated, unchanged, total: merged.length };
}
