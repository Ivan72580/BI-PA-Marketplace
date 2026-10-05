/**
 * Identidad de cancha ("Field 1", "Field 3", "Turf Field 2", "Old Trafford").
 *
 * La columna "Field" del CSV mezcla en un mismo texto el nombre/número de la
 * cancha y el formato ("Field # 1 (5v5)", "7v7 - (2)", "5v5 Field #1"...).
 * extractFieldType() (import-csv.ts) conserva solo lo descriptivo y descarta
 * el identificador; esto hace lo inverso: devuelve el identificador, sin el
 * formato (el formato ya vive en Game.gameSize), para poder distinguir la
 * Cancha 1 de la Cancha 3 de un mismo facility y horario.
 *
 * Devuelve null cuando no hay identificador real ("6v6", "East", vacío).
 */

const FORMAT_TOKEN = /\d{1,2}\s*v\s*\d{1,2}(\s+[a-z]\b)?/gi; // "7v7", "5 v 5", "7v7 A"
const REGION_LEAKAGE = new Set(["east", "west", "north", "south"]);

function titleToken(w: string): string {
  // "7A" / "J2" / "2C" quedan en mayúscula; palabras normales, Capitalizadas.
  if (/\d/.test(w)) return w.toUpperCase();
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

export function extractFieldName(raw: string | undefined | null): string | null {
  if (!raw || !raw.trim()) return null;
  let s = raw.trim();
  if (REGION_LEAKAGE.has(s.toLowerCase())) return null;

  s = s.replace(FORMAT_TOKEN, " ");
  s = s.replace(/[()/&,]/g, " ");
  s = s.replace(/#/g, " ");
  s = s.replace(/\s-\s|\s-$|^-\s/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (REGION_LEAKAGE.has(s.toLowerCase())) return null;

  // Solo un número/código corto ("2", "1", "7A", "J2") → "Field <código>".
  if (/^[a-z]?\d{1,2}[a-z]?$/i.test(s)) return `Field ${s.toUpperCase()}`;

  // Marcas internas que no son una cancha real.
  if (/^do not use$/i.test(s)) return null;

  // "Field" suelto sin identificador no distingue nada.
  if (/^(fields?|cancha|canchas)$/i.test(s)) return null;

  // "2C Field", "J2 Field" → "Field 2C"; "Field 2" queda igual.
  const codeField = s.match(/^([a-z]?\d{1,2}[a-z]?)\s+fields?$/i);
  if (codeField) return `Field ${codeField[1].toUpperCase()}`;

  // "#1 Old Trafford" → "Old Trafford 1" (el número deja de ir adelante).
  const numFirst = s.match(/^(\d{1,2})\s+(.+)$/);
  if (numFirst && !/^fields?$/i.test(numFirst[2])) s = `${numFirst[2]} ${numFirst[1]}`;

  return s.split(" ").map(titleToken).join(" ");
}
