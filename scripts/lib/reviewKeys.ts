/**
 * Lógica de identidad de reviews, compartida entre los importadores
 * (import-game-reviews.ts / import-app-reviews.ts) y el merge del archivo
 * madre en auto-import.ts — para que las dos capas (base de datos y CSV en
 * disco) usen exactamente el mismo criterio de "esta fila es la misma
 * review que ya tenía" y nunca queden desincronizadas entre sí.
 *
 * Ninguno de los dos CSV de origen trae un ID de review estable, así que
 * reviewKey se calcula a partir de un subconjunto de columnas elegidas para
 * identificar la review en sí, dejando afuera las columnas que pueden
 * cambiar legítimamente entre una exportación y la siguiente (rating/tags/
 * texto para reviews de partido; toda la parte de respuesta para reviews
 * de la app). Ver el comentario en schema.prisma para el razonamiento
 * completo.
 */
import crypto from "crypto";

// Normaliza el teléfono a solo dígitos y, si quedan 10 (el 99.7% del
// dataset — EE.UU. sin código de país), le agrega el "1" — mismo criterio
// que usa el resto del dataset (+1XXXXXXXXXX). Así "+17865472120" y un
// eventual "786-547-2120" del mismo número normalizan al mismo valor antes
// de hashear.
export function normalizePhoneDigits(raw: string | undefined | null): string | null {
  const digits = raw?.replace(/\D/g, "");
  if (!digits) return null;
  return digits.length === 10 ? `1${digits}` : digits;
}

// Nunca el número real (decisión de Ivan, 25 sep 2026): SHA-256 del
// teléfono normalizado.
export function hashPhone(raw: string | undefined | null): string | null {
  const normalized = normalizePhoneDigits(raw);
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// Identidad de una review de partido = gameId + teléfono (ya hasheado) +
// fecha. A propósito NO incluye rating/tags/reviewText — esos son los
// campos que se actualizan si la misma review vuelve a aparecer con otro
// valor (ej. se editó). Recibe las columnas ya extraídas (no el CSV crudo)
// para poder usarse tanto desde el import a la base como desde el merge
// del archivo madre en disco.
export function gameReviewKey(input: { gameId: string; date: string; playerPhone: string | undefined | null }): string {
  const parts = [input.gameId.trim(), hashPhone(input.playerPhone) ?? "", input.date.trim()];
  return sha256(parts.join("|"));
}

// Identidad de una review de app = fecha de review + plataforma. A
// propósito NO incluye rating/reviewText/reply* — el caso real más común
// para que la misma review vuelva a aparecer distinta es que se le agregue
// una respuesta después de que ya la habíamos importado.
export function appReviewKey(input: { reviewDate: string; source: string }): string {
  const parts = [input.reviewDate.trim(), input.source.trim().toLowerCase()];
  return sha256(parts.join("|"));
}
