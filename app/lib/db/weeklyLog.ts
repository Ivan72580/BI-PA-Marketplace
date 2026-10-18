import { prisma } from "./prisma";
import type { WeekRange } from "../weeklyLog";

// Registro semanal — consultas. Sin caché a propósito (a diferencia del
// resto de app/lib/db): son datos que el equipo carga a mano y tienen que
// verse apenas se guardan, y el volumen es chico (decenas de notas por semana).

export type WeeklyLogRow = {
  id: string;
  date: string; // YYYY-MM-DD
  text: string;
  topic: string | null;
  facilityId: string | null;
  facilityName: string | null;
  authorId: string;
  authorName: string;
  createdAt: number;
};

export async function getWeeklyLogEntries(range: WeekRange): Promise<WeeklyLogRow[]> {
  const rows = await prisma.weeklyLogEntry.findMany({
    where: { date: { gte: new Date(`${range.from}T00:00:00Z`), lte: new Date(`${range.to}T00:00:00Z`) } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { author: { select: { name: true, email: true } }, facility: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    text: r.text,
    topic: r.topic,
    facilityId: r.facilityId,
    facilityName: r.facility?.name ?? null,
    authorId: r.authorId,
    authorName: r.author.name || r.author.email.split("@")[0],
    createdAt: r.createdAt.getTime(),
  }));
}

// Temas usados en las últimas 12 semanas, para sugerirlos en el formulario
// junto con las facilities (ej. "POC Acme", "Pagos" no son facilities).
export async function getRecentWeeklyLogTopics(sinceISO: string): Promise<string[]> {
  const rows = await prisma.weeklyLogEntry.groupBy({
    by: ["topic"],
    where: { topic: { not: null }, facilityId: null, date: { gte: new Date(`${sinceISO}T00:00:00Z`) } },
    _count: { _all: true },
    orderBy: { _count: { topic: "desc" } },
    take: 50,
  });
  return rows.map((r) => r.topic).filter((t): t is string => !!t);
}
