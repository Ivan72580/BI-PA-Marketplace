"use server";

import { revalidatePath } from "next/cache";
import type { Amenity, IndoorOutdoor, PricingModel, RelationshipEventStatus, RelationshipEventType } from "@prisma/client";
import { prisma } from "../db/prisma";
import { requireLeadershipAccess } from "../db/users";

export type ActionResult = { ok: true } | { ok: false; errorKey: "unauthorized" | "generic" };

// Crea el perfil vacío si todavía no existe — tanto guardar el formulario
// como agregar la primera ventana de peak hours o el primer evento de
// historial necesitan que la fila padre exista antes.
async function ensureFacilityProfile(facilityId: string) {
  return prisma.facilityProfile.upsert({
    where: { facilityId },
    update: {},
    create: { facilityId },
  });
}

export type FacilityProfileInput = {
  city: string | null;
  state: string | null;
  fieldCount: number | null;
  supportedFormats: string[];
  indoorOutdoor: IndoorOutdoor | null;
  amenities: Amenity[];
  amenitiesOther: string | null;
  marketRate: number | null;
  partnershipStartDate: string | null; // ISO date ("YYYY-MM-DD"), viene de <input type="date">
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  paymentTerms: string | null;
  bookingTerms: string | null;
  cancellationTerms: string | null;
  depositAmount: number | null;
  depositNotes: string | null;
  pricingModel: PricingModel | null;
  fixedRate: number | null;
  revenueSharePct: number | null;
  discountAmount: number | null;
  discountPct: number | null;
  freeHoursPerMonth: number | null;
};

export async function saveFacilityProfile(facilityId: string, input: FacilityProfileInput): Promise<ActionResult> {
  const access = await requireLeadershipAccess();
  if (!access) return { ok: false, errorKey: "unauthorized" };

  try {
    await ensureFacilityProfile(facilityId);
    const { partnershipStartDate, ...rest } = input;
    await prisma.facilityProfile.update({
      where: { facilityId },
      data: {
        ...rest,
        partnershipStartDate: partnershipStartDate ? new Date(partnershipStartDate) : null,
      },
    });
    revalidatePath(`/leadership/facilities/${facilityId}`);
    revalidatePath("/leadership/facilities");
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}

export type PeakWindowInput = { dayOfWeek: number; startHour: number; endHour: number };

// Reemplaza todas las ventanas de una — son pocas por facility (2-4 típico)
// y el form las manda completas en cada guardado, así que borrar+recrear es
// más simple que reconciliar altas/bajas/ediciones fila por fila.
export async function savePeakWindows(facilityId: string, windows: PeakWindowInput[]): Promise<ActionResult> {
  const access = await requireLeadershipAccess();
  if (!access) return { ok: false, errorKey: "unauthorized" };

  try {
    const profile = await ensureFacilityProfile(facilityId);
    await prisma.$transaction([
      prisma.facilityPeakWindow.deleteMany({ where: { facilityProfileId: profile.id } }),
      prisma.facilityPeakWindow.createMany({
        data: windows.map((w) => ({ ...w, facilityProfileId: profile.id })),
      }),
    ]);
    revalidatePath(`/leadership/facilities/${facilityId}`);
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}

export type RelationshipEventInput = {
  type: RelationshipEventType;
  date: string; // ISO date
  note: string;
  status: RelationshipEventStatus | null;
  attachmentUrl: string | null;
};

export async function addRelationshipEvent(facilityId: string, input: RelationshipEventInput): Promise<ActionResult> {
  const access = await requireLeadershipAccess();
  if (!access) return { ok: false, errorKey: "unauthorized" };

  try {
    const profile = await ensureFacilityProfile(facilityId);
    await prisma.facilityRelationshipEvent.create({
      data: {
        facilityProfileId: profile.id,
        type: input.type,
        date: new Date(input.date),
        note: input.note,
        status: input.status ?? (input.type === "ACTION_ITEM" ? "OPEN" : null),
        attachmentUrl: input.attachmentUrl,
        createdByUserId: access.id,
      },
    });
    revalidatePath(`/leadership/facilities/${facilityId}`);
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}

export async function updateRelationshipEventStatus(
  eventId: string,
  facilityId: string,
  status: RelationshipEventStatus
): Promise<ActionResult> {
  const access = await requireLeadershipAccess();
  if (!access) return { ok: false, errorKey: "unauthorized" };

  try {
    await prisma.facilityRelationshipEvent.update({ where: { id: eventId }, data: { status } });
    revalidatePath(`/leadership/facilities/${facilityId}`);
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}

export async function deleteRelationshipEvent(eventId: string, facilityId: string): Promise<ActionResult> {
  const access = await requireLeadershipAccess();
  if (!access) return { ok: false, errorKey: "unauthorized" };

  try {
    await prisma.facilityRelationshipEvent.delete({ where: { id: eventId } });
    revalidatePath(`/leadership/facilities/${facilityId}`);
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}
