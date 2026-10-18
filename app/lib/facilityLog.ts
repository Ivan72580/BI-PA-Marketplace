// Bitácora de Facilities: catálogo, validación y resúmenes — lógica pura (sin Prisma ni hooks), compartida entre
// la página (server), el tablero (client) y las server actions.
//
// Principio: se registran HECHOS con atributos cerrados (qué pidió la facility, qué respondimos, cómo reaccionó),
// no etiquetas como "conflictivo". Así dos personas que registran lo mismo lo cargan igual, y las etiquetas se
// derivan después (Fase 2) con reglas sobre estos hechos. Subtipos y resoluciones viven acá y no como enums de la
// base para poder ajustarlos sin migrar; el tipo de evento sí es enum porque el cálculo se apoya en él.

export const LOG_KINDS = ["EVENT", "OBSERVATION", "INSIGHT"] as const;
export type LogKind = (typeof LOG_KINDS)[number];

export const EVENT_TYPES = [
  "RETIRO_SLOT",
  "LIBERACION_TARDIA",
  "OFERTA_RESIDUAL",
  "PEDIDO",
  "TRATO_INADECUADO",
  "SIN_RESPUESTA",
  "POSITIVO",
  "QUEJA_JUGADOR",
  "INCUMPLIMIENTO_PLEI",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const TONES = ["CORDIAL", "TENSE", "HOSTILE"] as const;
export type Tone = (typeof TONES)[number];

export const SENTIMENTS = ["POSITIVE", "NEUTRAL", "NEGATIVE"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const INSIGHT_KINDS = ["EXPECT", "HOW_TO_WORK", "IMPROVE"] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

/** Campos extra que se piden según el tipo de evento. */
export type EventField = "hours" | "hoursSincePublished" | "committedSlot" | "playersSigned" | "resolution" | "tone" | "usedData" | "severity";

type EventDef = {
  subtypes: readonly string[];
  fields: readonly EventField[];
  /** Si sí o sí hay que elegir subtipo. */
  subtypeRequired: boolean;
};

export const EVENT_CATALOG: Record<EventType, EventDef> = {
  // A. Disponibilidad iniciada por la facility
  RETIRO_SLOT: {
    subtypes: ["RENTED_PRIVATE", "SUBSTITUTION", "MAINTENANCE", "BOOKING_ERROR", "OTHER"],
    fields: ["committedSlot", "hours", "hoursSincePublished", "playersSigned"],
    subtypeRequired: true,
  },
  LIBERACION_TARDIA: { subtypes: [], fields: ["hours"], subtypeRequired: false },
  OFERTA_RESIDUAL: { subtypes: ["ONLY_LEFTOVERS", "NEVER_REPEATS", "MAX_ONE_PER_DAY", "OTHER"], fields: [], subtypeRequired: true },
  // B. Pedidos de la facility
  PEDIDO: {
    subtypes: ["PUBLISH_ALL", "MORE_GAMES", "CHANGE_SLOT", "PRICE", "OTHER"],
    fields: ["resolution", "tone", "usedData"],
    subtypeRequired: true,
  },
  // C. Trato y comunicación
  TRATO_INADECUADO: { subtypes: [], fields: ["severity", "tone"], subtypeRequired: false },
  SIN_RESPUESTA: { subtypes: [], fields: ["hours"], subtypeRequired: false },
  POSITIVO: { subtypes: ["SOLVED_PROBLEM", "EXTRA_SLOT", "EARLY_NOTICE", "ACCEPTED_NO", "OTHER"], fields: [], subtypeRequired: true },
  // D. Jugadores e instalación
  QUEJA_JUGADOR: { subtypes: ["STAFF", "FACILITY", "FIELD"], fields: [], subtypeRequired: true },
  // E. Incumplimiento nuestro
  INCUMPLIMIENTO_PLEI: { subtypes: ["LATE_CANCEL", "LATE_PAYMENT", "NO_REPLY", "OTHER"], fields: [], subtypeRequired: true },
};

export const PEDIDO_RESOLUTIONS = ["ACCEPTED", "REJECTED_ACCEPTED", "REJECTED_INSISTED_ACCEPTED", "REJECTED_REACTED_BADLY", "IMPOSED_CONDITION"] as const;
/** Resoluciones en las que dijimos que no. Las dos últimas son las que cuentan como conflicto (Fase 2). */
export const REJECTED_RESOLUTIONS: readonly string[] = ["REJECTED_ACCEPTED", "REJECTED_INSISTED_ACCEPTED", "REJECTED_REACTED_BADLY", "IMPOSED_CONDITION"];

/** Tipos que cuentan como señal negativa / positiva para los totales de la ficha. */
const NEGATIVE_TYPES: readonly EventType[] = ["RETIRO_SLOT", "LIBERACION_TARDIA", "OFERTA_RESIDUAL", "TRATO_INADECUADO", "SIN_RESPUESTA", "QUEJA_JUGADOR", "INCUMPLIMIENTO_PLEI"];

export const MAX_TEXT_LENGTH = 2000;
export const MAX_TOPIC_LENGTH = 80;
export const MAX_REPLY_LENGTH = 1000;
export const MAX_URL_LENGTH = 500;

// ---------- Validación de un aporte ----------

/** Lo que llega del formulario. Todo opcional salvo lo común: cada tipo usa solo sus campos. */
export type LogInput = {
  facilityId: string;
  kind: LogKind;
  date: string; // YYYY-MM-DD
  text: string;
  evidenceUrl?: string;
  // EVENT
  eventType?: EventType;
  subtype?: string;
  tone?: Tone;
  resolution?: string;
  usedData?: boolean;
  committedSlot?: boolean;
  hours?: number | null;
  hoursSincePublished?: number | null;
  playersSigned?: number | null;
  severity?: number | null;
  gameId?: number | null;
  // OBSERVATION
  topic?: string;
  sentiment?: Sentiment;
  // INSIGHT
  insightKind?: InsightKind;
};

/** Fila lista para guardar: solo los campos que corresponden al tipo, el resto en null. */
export type CleanLog = {
  facilityId: string;
  kind: LogKind;
  occurredAt: string;
  text: string;
  evidenceUrl: string | null;
  eventType: EventType | null;
  subtype: string | null;
  tone: Tone | null;
  resolution: string | null;
  usedData: boolean | null;
  committedSlot: boolean | null;
  hours: number | null;
  hoursSincePublished: number | null;
  playersSigned: number | null;
  severity: number | null;
  gameId: number | null;
  topic: string | null;
  sentiment: Sentiment | null;
  insightKind: InsightKind | null;
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
function isISO(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

function intOrNull(v: unknown, min: number, max: number): number | null | "bad" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) return "bad";
  return v;
}

function cleanUrl(raw: string | undefined): string | null | "bad" {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (v.length > MAX_URL_LENGTH) return "bad";
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? v : "bad";
  } catch {
    return "bad";
  }
}

/** null = el aporte no es válido (el formulario ya marca lo obligatorio; esto es la red de seguridad del servidor). */
export function cleanLogInput(input: LogInput): CleanLog | null {
  const text = (input.text ?? "").trim();
  if (!input.facilityId || !text || text.length > MAX_TEXT_LENGTH || !isISO(input.date)) return null;
  if (!oneOf(LOG_KINDS, input.kind)) return null;
  const url = cleanUrl(input.evidenceUrl);
  if (url === "bad") return null;

  const out: CleanLog = {
    facilityId: input.facilityId,
    kind: input.kind,
    occurredAt: input.date,
    text,
    evidenceUrl: url,
    eventType: null,
    subtype: null,
    tone: null,
    resolution: null,
    usedData: null,
    committedSlot: null,
    hours: null,
    hoursSincePublished: null,
    playersSigned: null,
    severity: null,
    gameId: null,
    topic: null,
    sentiment: null,
    insightKind: null,
  };

  if (input.kind === "OBSERVATION") {
    const topic = (input.topic ?? "").trim().replace(/\s+/g, " ");
    if (!topic || topic.length > MAX_TOPIC_LENGTH || !oneOf(SENTIMENTS, input.sentiment)) return null;
    out.topic = topic;
    out.sentiment = input.sentiment;
    return out;
  }

  if (input.kind === "INSIGHT") {
    if (!oneOf(INSIGHT_KINDS, input.insightKind)) return null;
    out.insightKind = input.insightKind;
    return out;
  }

  // EVENT
  if (!oneOf(EVENT_TYPES, input.eventType)) return null;
  const def = EVENT_CATALOG[input.eventType];
  out.eventType = input.eventType;

  if (def.subtypes.length > 0) {
    if (input.subtype && !def.subtypes.includes(input.subtype)) return null;
    if (def.subtypeRequired && !input.subtype) return null;
    out.subtype = input.subtype ?? null;
  }

  const has = (f: EventField) => def.fields.includes(f);
  if (has("tone")) {
    if (input.tone !== undefined && !oneOf(TONES, input.tone)) return null;
    out.tone = input.tone ?? null;
  }
  if (has("resolution")) {
    if (input.resolution && !oneOf(PEDIDO_RESOLUTIONS, input.resolution)) return null;
    out.resolution = input.resolution ?? null;
    // "Usamos datos" solo tiene sentido si dijimos que no.
    if (out.resolution && REJECTED_RESOLUTIONS.includes(out.resolution) && typeof input.usedData === "boolean") out.usedData = input.usedData;
  }
  if (has("committedSlot") && typeof input.committedSlot === "boolean") out.committedSlot = input.committedSlot;
  if (has("severity")) {
    const sev = intOrNull(input.severity, 1, 3);
    if (sev === "bad" || sev === null) return null; // la severidad define el peso: es obligatoria
    out.severity = sev;
  }
  for (const [field, max] of [["hours", 24 * 90], ["hoursSincePublished", 24 * 365], ["playersSigned", 500]] as const) {
    if (!has(field)) continue;
    const v = intOrNull(input[field], 0, max);
    if (v === "bad") return null;
    out[field] = v;
  }
  const game = intOrNull(input.gameId, 1, 2_000_000_000);
  if (game === "bad") return null;
  out.gameId = game;
  return out;
}

// ---------- Resumen de una facility ----------

export type LogSummaryEntry = {
  kind: LogKind;
  eventType: EventType | null;
  sentiment: Sentiment | null;
  authorId: string | null;
  occurredAt: string;
};

export type LogSummary = {
  total: number;
  byKind: Record<LogKind, number>;
  /** Personas distintas que aportaron (más personas = más perspectivas). */
  contributors: number;
  /** Aportes con señal negativa / positiva en los últimos `recentDays` días (hasta `today`). */
  recentNegative: number;
  recentPositive: number;
  lastDate: string | null;
};

export function isNegative(e: Pick<LogSummaryEntry, "kind" | "eventType" | "sentiment">): boolean {
  if (e.kind === "EVENT") return e.eventType !== null && NEGATIVE_TYPES.includes(e.eventType);
  if (e.kind === "OBSERVATION") return e.sentiment === "NEGATIVE";
  return false;
}

export function isPositive(e: Pick<LogSummaryEntry, "kind" | "eventType" | "sentiment">): boolean {
  if (e.kind === "EVENT") return e.eventType === "POSITIVO";
  if (e.kind === "OBSERVATION") return e.sentiment === "POSITIVE";
  return false;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function summarizeLog(entries: LogSummaryEntry[], today: string, recentDays = 90): LogSummary {
  const since = addDays(today, -recentDays);
  const byKind: Record<LogKind, number> = { EVENT: 0, OBSERVATION: 0, INSIGHT: 0 };
  const people = new Set<string>();
  let recentNegative = 0;
  let recentPositive = 0;
  let lastDate: string | null = null;
  for (const e of entries) {
    byKind[e.kind] += 1;
    if (e.authorId) people.add(e.authorId);
    if (!lastDate || e.occurredAt > lastDate) lastDate = e.occurredAt;
    if (e.occurredAt >= since && e.occurredAt <= today) {
      if (isNegative(e)) recentNegative += 1;
      else if (isPositive(e)) recentPositive += 1;
    }
  }
  return { total: entries.length, byKind, contributors: people.size, recentNegative, recentPositive, lastDate };
}
