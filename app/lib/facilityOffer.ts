// Bitácora de Facilities — oferta declarada vs. observada. Lógica pura.
//
// DECLARADA: lo que la facility dice que da (la carga el equipo, con historial).
// OBSERVADA: lo que efectivamente publica, medido en recurrencia de slots (mismo día de semana + hora) sobre los
// últimos 90 días. Con los datos de partidos NO se puede distinguir "bloqueada" de "recurrente no bloqueada" (el
// bloqueo es un acuerdo, no se ve en los partidos), por eso ambas se esperan recurrentes.

export const OFFER_MODALITIES = ["BLOCKED_RECURRING", "RECURRING", "DAILY_VARIABLE", "RESIDUAL_ONLY"] as const;
export type OfferModality = (typeof OFFER_MODALITIES)[number];

export type ObservedKind = "RECURRENT" | "VARIABLE" | "SPORADIC" | "NO_DATA";
export type OfferVerdict = "MATCH" | "BELOW" | "ABOVE";

export const OFFER_WINDOW_DAYS = 90;
/** Un slot cuenta como recurrente si apareció en al menos tantas semanas distintas (≈ una vez por mes). */
export const RECURRENT_MIN_WEEKS = 4;
/** Porción de partidos en slots recurrentes para decir que la oferta es recurrente. */
export const RECURRENT_SHARE = 0.6;
/** Menos partidos que esto en la ventana: no alcanza para opinar. */
export const MIN_GAMES = 6;
export const MAX_NOTE_LENGTH = 500;

export type ObservedOffer = {
  kind: ObservedKind;
  games: number;
  /** Partidos por semana en la ventana. */
  perWeek: number;
  /** % de los partidos que caen en slots recurrentes (0–100). */
  recurrentPct: number;
  /** Slots distintos (día + hora) usados. */
  slots: number;
};

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

/** `games`: partidos publicados (confirmados y cancelados) de la ventana, con fecha YYYY-MM-DD y hora HH:MM. */
export function computeObservedOffer(games: { date: string; time: string }[]): ObservedOffer {
  const bySlot = new Map<string, { n: number; weeks: Set<number> }>();
  for (const g of games) {
    const dn = dayNumber(g.date);
    const weekday = (((dn + 4) % 7) + 7) % 7; // 1970-01-01 fue jueves
    const key = `${weekday}|${g.time}`;
    const s = bySlot.get(key) ?? { n: 0, weeks: new Set<number>() };
    s.n += 1;
    s.weeks.add(Math.floor((dn + 3) / 7)); // semanas lunes–domingo
    bySlot.set(key, s);
  }
  const total = games.length;
  let inRecurrent = 0;
  for (const s of bySlot.values()) if (s.weeks.size >= RECURRENT_MIN_WEEKS) inRecurrent += s.n;
  const share = total > 0 ? inRecurrent / total : 0;
  const perWeek = total / (OFFER_WINDOW_DAYS / 7);
  const kind: ObservedKind = total < MIN_GAMES ? "NO_DATA" : share >= RECURRENT_SHARE ? "RECURRENT" : perWeek >= 1 ? "VARIABLE" : "SPORADIC";
  return { kind, games: total, perWeek: Math.round(perWeek * 10) / 10, recurrentPct: Math.round(share * 100), slots: bySlot.size };
}

/** ¿Lo que dice coincide con lo que da? BELOW = da menos de lo declarado (lo grave); ABOVE = da más (buena noticia). */
export function compareOffer(declared: OfferModality | null, observed: ObservedOffer): OfferVerdict | null {
  if (!declared || observed.kind === "NO_DATA") return null;
  if (declared === "BLOCKED_RECURRING" || declared === "RECURRING") return observed.kind === "RECURRENT" ? "MATCH" : "BELOW";
  if (declared === "DAILY_VARIABLE") return observed.kind === "RECURRENT" ? "ABOVE" : observed.kind === "VARIABLE" ? "MATCH" : "BELOW";
  return observed.kind === "RECURRENT" ? "ABOVE" : "MATCH"; // RESIDUAL_ONLY
}

export type DeclarationLite = { modality: OfferModality; authorId: string | null; createdAt: number };

/** Dos personas distintas declararon modalidades distintas en los últimos `days` días (la lista viene más reciente primero). */
export function hasConflictingDeclarations(list: DeclarationLite[], now: number, days = 60): boolean {
  const recent = list.filter((d) => now - d.createdAt <= days * 86_400_000);
  for (let i = 0; i < recent.length; i++)
    for (let j = i + 1; j < recent.length; j++)
      if (recent[i].modality !== recent[j].modality && recent[i].authorId !== recent[j].authorId) return true;
  return false;
}
