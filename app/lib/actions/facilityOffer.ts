"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../db/prisma";
import { requireModule } from "../db/users";
import { MAX_NOTE_LENGTH, OFFER_MODALITIES, type OfferModality } from "../facilityOffer";

export type OfferActionResult = { ok: true } | { ok: false; errorKey: "unauthorized" | "invalid" | "generic" };

// Declarar la oferta de una facility: EDIT en Equipo. Cada declaración es una fila nueva (historial); no se edita ni se borra.
export async function declareFacilityOffer(input: { facilityId: string; modality: OfferModality; otherOrganizers: boolean | null; note: string }): Promise<OfferActionResult> {
  const user = await requireModule("TEAM", "EDIT");
  if (!user) return { ok: false, errorKey: "unauthorized" };
  if (!OFFER_MODALITIES.includes(input.modality)) return { ok: false, errorKey: "invalid" };
  const note = input.note.trim();
  if (note.length > MAX_NOTE_LENGTH) return { ok: false, errorKey: "invalid" };
  try {
    const facility = await prisma.facility.findUnique({ where: { id: input.facilityId }, select: { id: true } });
    if (!facility) return { ok: false, errorKey: "invalid" };
    await prisma.facilityOfferDeclaration.create({
      data: { facilityId: input.facilityId, authorId: user.id, modality: input.modality, otherOrganizers: typeof input.otherOrganizers === "boolean" ? input.otherOrganizers : null, note: note || null },
    });
    revalidatePath("/facility-log");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}
