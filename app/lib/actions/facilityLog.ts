"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { requireModule } from "../db/users";
import { cleanLogInput, MAX_REPLY_LENGTH, type LogInput } from "../facilityLog";

export type FacilityLogActionResult = { ok: true } | { ok: false; errorKey: "unauthorized" | "invalid" | "generic" };

// Cargar aportes, reaccionar y responder requieren EDIT en el módulo Equipo (TEAM); mirar, VIEW. Editar y borrar
// un aporte: quien lo escribió (si sigue teniendo EDIT) o un ADMIN. No se puede reaccionar al propio aporte
// (coincidir con uno mismo no aporta una segunda perspectiva).

function toData(clean: NonNullable<ReturnType<typeof cleanLogInput>>) {
  const { occurredAt, ...rest } = clean;
  return { ...rest, occurredAt: new Date(`${occurredAt}T00:00:00Z`) } satisfies Omit<Prisma.FacilityLogEntryUncheckedCreateInput, "authorId" | "id">;
}

export async function addFacilityLogEntry(input: LogInput): Promise<FacilityLogActionResult> {
  const user = await requireModule("TEAM", "EDIT");
  if (!user) return { ok: false, errorKey: "unauthorized" };
  const clean = cleanLogInput(input);
  if (!clean) return { ok: false, errorKey: "invalid" };
  try {
    const facility = await prisma.facility.findUnique({ where: { id: clean.facilityId }, select: { id: true } });
    if (!facility) return { ok: false, errorKey: "invalid" };
    await prisma.facilityLogEntry.create({ data: { ...toData(clean), authorId: user.id } });
    revalidatePath("/facility-log");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}

async function canTouch(entryId: string) {
  const editor = await requireModule("TEAM", "EDIT");
  const viewer = editor ?? (await requireModule("TEAM", "VIEW"));
  if (!viewer) return null;
  const entry = await prisma.facilityLogEntry.findUnique({ where: { id: entryId }, select: { authorId: true } });
  if (!entry) return null;
  if (viewer.role === "ADMIN") return viewer;
  return editor && entry.authorId === editor.id ? editor : null;
}

export async function updateFacilityLogEntry(entryId: string, input: LogInput): Promise<FacilityLogActionResult> {
  try {
    if (!(await canTouch(entryId))) return { ok: false, errorKey: "unauthorized" };
    const clean = cleanLogInput(input);
    if (!clean) return { ok: false, errorKey: "invalid" };
    await prisma.facilityLogEntry.update({ where: { id: entryId }, data: toData(clean) });
    revalidatePath("/facility-log");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}

export async function deleteFacilityLogEntry(entryId: string): Promise<FacilityLogActionResult> {
  try {
    if (!(await canTouch(entryId))) return { ok: false, errorKey: "unauthorized" };
    await prisma.facilityLogEntry.delete({ where: { id: entryId } });
    revalidatePath("/facility-log");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}

/** agrees: true = coincido, false = no coincido, null = quitar la reacción. */
export async function reactToFacilityLogEntry(entryId: string, agrees: boolean | null): Promise<FacilityLogActionResult> {
  const user = await requireModule("TEAM", "EDIT");
  if (!user) return { ok: false, errorKey: "unauthorized" };
  try {
    const entry = await prisma.facilityLogEntry.findUnique({ where: { id: entryId }, select: { authorId: true } });
    if (!entry || entry.authorId === user.id) return { ok: false, errorKey: "invalid" };
    const key = { entryId_userId: { entryId, userId: user.id } };
    if (agrees === null) {
      await prisma.facilityLogReaction.deleteMany({ where: { entryId, userId: user.id } });
    } else {
      await prisma.facilityLogReaction.upsert({ where: key, create: { entryId, userId: user.id, agrees }, update: { agrees } });
    }
    revalidatePath("/facility-log");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}

export async function addFacilityLogReply(entryId: string, text: string): Promise<FacilityLogActionResult> {
  const user = await requireModule("TEAM", "EDIT");
  if (!user) return { ok: false, errorKey: "unauthorized" };
  const clean = text.trim();
  if (!clean || clean.length > MAX_REPLY_LENGTH) return { ok: false, errorKey: "invalid" };
  try {
    const entry = await prisma.facilityLogEntry.findUnique({ where: { id: entryId }, select: { id: true } });
    if (!entry) return { ok: false, errorKey: "invalid" };
    await prisma.facilityLogReply.create({ data: { entryId, authorId: user.id, text: clean } });
    revalidatePath("/facility-log");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}

export async function deleteFacilityLogReply(replyId: string): Promise<FacilityLogActionResult> {
  const editor = await requireModule("TEAM", "EDIT");
  if (!editor) return { ok: false, errorKey: "unauthorized" };
  try {
    const reply = await prisma.facilityLogReply.findUnique({ where: { id: replyId }, select: { authorId: true } });
    if (!reply || (reply.authorId !== editor.id && editor.role !== "ADMIN")) return { ok: false, errorKey: "unauthorized" };
    await prisma.facilityLogReply.delete({ where: { id: replyId } });
    revalidatePath("/facility-log");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}
