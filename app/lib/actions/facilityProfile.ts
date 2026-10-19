"use server";

import { revalidatePath } from "next/cache";
import type { Amenity, IndoorOutdoor, PricingModel, RateUnit } from "@prisma/client";
import { prisma } from "../db/prisma";
import { requireModule } from "../db/users";

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
  rateUnit: RateUnit | null;
  // Texto de tarifas tal como vino del Sheet (con notas); se edita a mano.
  pricingRawText: string | null;
  address: string | null;
  postalCode: string | null;
  website: string | null;
  facilityTypes: string[];
  isActive: boolean | null;
  // No se persiste: tildarlo marca las tarifas como verificadas hoy aunque
  // no haya cambiado ningún valor (el Sheet puede estar bien, solo viejo).
  confirmRates: boolean;
};

// Cambiar cualquiera de estos campos cuenta como "revisé las tarifas".
const RATE_FIELDS = ["marketRate", "pricingModel", "fixedRate", "rateUnit", "revenueSharePct", "discountAmount", "discountPct", "freeHoursPerMonth"] as const;

export async function saveFacilityProfile(facilityId: string, input: FacilityProfileInput): Promise<ActionResult> {
  const access = await requireModule("TEAM", "EDIT");
  if (!access) return { ok: false, errorKey: "unauthorized" };

  try {
    const before = (await ensureFacilityProfile(facilityId)) as unknown as Record<string, unknown>;
    const { partnershipStartDate, confirmRates, ...rest } = input;
    const ratesChanged = RATE_FIELDS.some((k) => (before[k] ?? null) !== (rest[k] ?? null));
    await prisma.facilityProfile.update({
      where: { facilityId },
      data: {
        ...rest,
        partnershipStartDate: partnershipStartDate ? new Date(partnershipStartDate) : null,
        ...(confirmRates || ratesChanged ? { ratesVerifiedAt: new Date() } : {}),
      },
    });
    revalidatePath(`/facility-profile/${facilityId}`);
    revalidatePath("/facility-profile");
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
  const access = await requireModule("TEAM", "EDIT");
  if (!access) return { ok: false, errorKey: "unauthorized" };

  try {
    const profile = await ensureFacilityProfile(facilityId);
    await prisma.$transaction([
      prisma.facilityPeakWindow.deleteMany({ where: { facilityProfileId: profile.id } }),
      prisma.facilityPeakWindow.createMany({
        data: windows.map((w) => ({ ...w, facilityProfileId: profile.id })),
      }),
    ]);
    revalidatePath(`/facility-profile/${facilityId}`);
    return { ok: true };
  } catch {
    return { ok: false, errorKey: "generic" };
  }
}
