import { prisma } from "./prisma";
import type { EventType, InsightKind, LogKind, Sentiment, Tone } from "../facilityLog";

// Bitácora de Facilities — consultas. Sin caché a propósito (igual que el Registro semanal): son datos que el
// equipo carga a mano y tienen que verse apenas se guardan.

export type LogReply = { id: string; authorId: string; authorName: string; text: string; createdAt: number };

export type LogRow = {
  id: string;
  facilityId: string;
  facilityName: string;
  marketName: string;
  authorId: string | null;
  authorName: string | null;
  kind: LogKind;
  date: string; // YYYY-MM-DD
  text: string;
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
  evidenceUrl: string | null;
  agree: number;
  disagree: number;
  /** Reacción de la persona que mira: true = coincido, false = no coincido, null = ninguna. */
  mine: boolean | null;
  replies: LogReply[];
};

export type LogScope = { regionId?: string; marketId?: string; facilityId?: string; regionIds?: string[] };

/** Filtro de facilities del alcance. Un filtro explícito (facility, market, región) manda sobre `regionIds`. */
export function logFacilityWhere(scope: LogScope) {
  return scope.facilityId
    ? { id: scope.facilityId }
    : scope.marketId
      ? { marketId: scope.marketId }
      : scope.regionId
        ? { market: { regionId: scope.regionId } }
        : scope.regionIds?.length
          ? { market: { regionId: { in: scope.regionIds } } }
          : {};
}

const nameOf = (u: { name: string | null; email: string }) => u.name || u.email.split("@")[0];

/** Aportes más recientes primero. `limit + 1` filas para saber si hay más (lo resuelve el llamador con `hasMore`). */
export async function getFacilityLogEntries(
  scope: LogScope,
  opts: { kind?: LogKind; limit: number; meId: string | null },
): Promise<{ rows: LogRow[]; hasMore: boolean }> {
  const facilityWhere = logFacilityWhere(scope);
  const found = await prisma.facilityLogEntry.findMany({
    where: { facility: facilityWhere, ...(opts.kind ? { kind: opts.kind } : {}) },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: opts.limit + 1,
    include: {
      facility: { select: { name: true, market: { select: { name: true } } } },
      author: { select: { name: true, email: true } },
      reactions: { select: { userId: true, agrees: true } },
      replies: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, email: true } } } },
    },
  });
  const hasMore = found.length > opts.limit;
  const rows: LogRow[] = found.slice(0, opts.limit).map((r) => ({
    id: r.id,
    facilityId: r.facilityId,
    facilityName: r.facility.name,
    marketName: r.facility.market.name,
    authorId: r.authorId,
    authorName: r.author ? nameOf(r.author) : null,
    kind: r.kind,
    date: r.occurredAt.toISOString().slice(0, 10),
    text: r.text,
    eventType: r.eventType,
    subtype: r.subtype,
    tone: r.tone,
    resolution: r.resolution,
    usedData: r.usedData,
    committedSlot: r.committedSlot,
    hours: r.hours,
    hoursSincePublished: r.hoursSincePublished,
    playersSigned: r.playersSigned,
    severity: r.severity,
    gameId: r.gameId,
    topic: r.topic,
    sentiment: r.sentiment,
    insightKind: r.insightKind,
    evidenceUrl: r.evidenceUrl,
    agree: r.reactions.filter((x) => x.agrees).length,
    disagree: r.reactions.filter((x) => !x.agrees).length,
    mine: opts.meId ? (r.reactions.find((x) => x.userId === opts.meId)?.agrees ?? null) : null,
    replies: r.replies.map((p) => ({ id: p.id, authorId: p.authorId, authorName: nameOf(p.author), text: p.text, createdAt: p.createdAt.getTime() })),
  }));
  return { rows, hasMore };
}

/** Datos mínimos de TODOS los aportes del alcance, para los totales de la ficha (no se trae el texto). */
export async function getFacilityLogSummaryRows(scope: LogScope) {
  const facilityWhere = logFacilityWhere(scope);
  const rows = await prisma.facilityLogEntry.findMany({
    where: { facility: facilityWhere },
    select: { kind: true, eventType: true, sentiment: true, authorId: true, occurredAt: true },
  });
  return rows.map((r) => ({
    kind: r.kind,
    eventType: r.eventType,
    sentiment: r.sentiment,
    authorId: r.authorId,
    occurredAt: r.occurredAt.toISOString().slice(0, 10),
  }));
}

export type LinkedWeeklyNote = { id: string; date: string; text: string; topic: string | null; authorName: string };

/** Notas del Registro semanal vinculadas a la facility (por nombre), de los últimos días. */
export async function getWeeklyNotesForFacility(facilityId: string, sinceISO: string): Promise<LinkedWeeklyNote[]> {
  const rows = await prisma.weeklyLogEntry.findMany({
    where: { facilityId, date: { gte: new Date(`${sinceISO}T00:00:00Z`) } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 20,
    include: { author: { select: { name: true, email: true } } },
  });
  return rows.map((r) => ({ id: r.id, date: r.date.toISOString().slice(0, 10), text: r.text, topic: r.topic, authorName: nameOf(r.author) }));
}

/** Temas de observaciones ya usados, para sugerirlos en el formulario. */
export async function getRecentLogTopics(): Promise<string[]> {
  const rows = await prisma.facilityLogEntry.groupBy({
    by: ["topic"],
    where: { topic: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { topic: "desc" } },
    take: 30,
  });
  return rows.map((r) => r.topic).filter((t): t is string => !!t);
}
