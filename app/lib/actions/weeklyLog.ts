"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "../db/prisma";
import { requireModule } from "../db/users";
import { parseTeamRegions, TEAM_REGIONS_COOKIE } from "../teamRegions";
import { isISODate, matchFacilityId, MAX_TEXT_LENGTH, MAX_TOPIC_LENGTH } from "../weeklyLog";

export type WeeklyLogActionResult = { ok: true } | { ok: false; errorKey: "unauthorized" | "invalid" | "generic" };

export type WeeklyLogInput = { date: string; text: string; topic: string };

// Anotar requiere EDIT en el módulo Equipo (TEAM). Editar y borrar: quien
// escribió la nota (si sigue teniendo EDIT), o un ADMIN (para limpiar notas
// de alguien que ya no está).

function clean(input: WeeklyLogInput): { date: Date; text: string; topic: string | null } | null {
  const text = input.text.trim();
  const topic = input.topic.trim().replace(/\s+/g, " ");
  if (!text || text.length > MAX_TEXT_LENGTH || topic.length > MAX_TOPIC_LENGTH || !isISODate(input.date)) return null;
  return { date: new Date(`${input.date}T00:00:00Z`), text, topic: topic || null };
}

// Región de la nota: la de su facility; sin facility, la que la persona tiene elegida si es una sola.
async function regionIdFor(facilityId: string | null): Promise<string | null> {
  if (facilityId) {
    const f = await prisma.facility.findUnique({ where: { id: facilityId }, select: { market: { select: { regionId: true } } } });
    return f?.market.regionId ?? null;
  }
  const regions = await prisma.region.findMany({ select: { id: true } });
  const chosen = parseTeamRegions((await cookies()).get(TEAM_REGIONS_COOKIE)?.value, regions.map((r) => r.id));
  return chosen.length === 1 ? chosen[0] : null;
}

async function facilityIdFor(topic: string | null): Promise<string | null> {
  if (!topic) return null;
  // Son unos cientos de facilities: traerlas todas y comparar en JS permite
  // ignorar acentos y espacios con el mismo criterio que el formulario.
  const facilities = await prisma.facility.findMany({ select: { id: true, name: true } });
  return matchFacilityId(topic, facilities);
}

export async function addWeeklyLogEntry(input: WeeklyLogInput): Promise<WeeklyLogActionResult> {
  const user = await requireModule("TEAM", "EDIT");
  if (!user) return { ok: false, errorKey: "unauthorized" };
  const data = clean(input);
  if (!data) return { ok: false, errorKey: "invalid" };
  try {
    const facilityId = await facilityIdFor(data.topic);
    await prisma.weeklyLogEntry.create({
      data: { ...data, facilityId, regionId: await regionIdFor(facilityId), authorId: user.id },
    });
    revalidatePath("/weekly-log");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}

async function canTouch(entryId: string) {
  const editor = await requireModule("TEAM", "EDIT");
  const viewer = editor ?? (await requireModule("TEAM", "VIEW"));
  if (!viewer) return null;
  const entry = await prisma.weeklyLogEntry.findUnique({ where: { id: entryId }, select: { authorId: true } });
  if (!entry) return null;
  if (viewer.role === "ADMIN") return viewer;
  return editor && entry.authorId === editor.id ? editor : null;
}

export async function updateWeeklyLogEntry(entryId: string, input: WeeklyLogInput): Promise<WeeklyLogActionResult> {
  try {
    if (!(await canTouch(entryId))) return { ok: false, errorKey: "unauthorized" };
    const data = clean(input);
    if (!data) return { ok: false, errorKey: "invalid" };
    const facilityId = await facilityIdFor(data.topic);
    const current = await prisma.weeklyLogEntry.findUnique({ where: { id: entryId }, select: { regionId: true } });
    await prisma.weeklyLogEntry.update({
      where: { id: entryId },
      // Con facility, la región sigue a la facility; sin facility se conserva la que ya tenía la nota.
      data: { ...data, facilityId, regionId: facilityId ? await regionIdFor(facilityId) : current?.regionId ?? null },
    });
    revalidatePath("/weekly-log");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}

export async function deleteWeeklyLogEntry(entryId: string): Promise<WeeklyLogActionResult> {
  try {
    if (!(await canTouch(entryId))) return { ok: false, errorKey: "unauthorized" };
    await prisma.weeklyLogEntry.delete({ where: { id: entryId } });
    revalidatePath("/weekly-log");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}
