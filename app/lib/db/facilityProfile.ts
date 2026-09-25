import { GameStatus } from "@prisma/client";
import { prisma } from "./prisma";

// Módulo de datos maestros del facility (perfil + relación comercial +
// bitácora), enlazado desde /leadership. A diferencia del resto de
// app/lib/db/*.ts, esto NO se envuelve en cached(): es data que se edita
// desde la propia UI (revalidatePath en cada acción se encarga de
// refrescarla), no un agregado pesado sobre miles de partidos.

// ---------- Lista con estado de completitud (/leadership/facilities) ----------
// "Núcleo" = un subconjunto representativo de campos, no los ~25 del
// perfil completo — es solo una señal rápida de cuánto se cargó cada
// facility, para priorizar cuál completar primero.
const CORE_FIELDS = ["city", "state", "fieldCount", "indoorOutdoor", "marketRate", "partnershipStartDate", "contactName", "pricingModel"] as const;

type CoreProfileFields = {
  city: string | null;
  state: string | null;
  fieldCount: number | null;
  indoorOutdoor: string | null;
  marketRate: number | null;
  partnershipStartDate: Date | null;
  contactName: string | null;
  pricingModel: string | null;
};

function countCoreFieldsFilled(profile: CoreProfileFields | null): number {
  if (!profile) return 0;
  return CORE_FIELDS.filter((key) => {
    const value = profile[key];
    return value !== null && value !== undefined;
  }).length;
}

export type FacilityProfileListRow = {
  facilityId: string;
  facilityName: string;
  marketName: string;
  regionName: string;
  hasProfile: boolean;
  coreFieldsFilled: number;
  coreFieldsTotal: number;
};

// Tipos explícitos para el resultado de la query — el cliente de Prisma en
// este sandbox está desactualizado (no conoce FacilityProfile todavía, ver
// nota de verificación en el patch), así que sin esto el resultado cae en
// `any` y arrastra un implicit-any a cada callback. Mismo criterio que
// FacilityRegionRow en region.ts.
type FacilityStatusRow = {
  id: string;
  name: string;
  market: { name: string; region: { name: string } };
  profile: CoreProfileFields | null;
};

export async function listFacilityProfileStatus(): Promise<FacilityProfileListRow[]> {
  const facilities = (await prisma.facility.findMany({
    select: {
      id: true,
      name: true,
      market: { select: { name: true, region: { select: { name: true } } } },
      profile: {
        select: {
          city: true,
          state: true,
          fieldCount: true,
          indoorOutdoor: true,
          marketRate: true,
          partnershipStartDate: true,
          contactName: true,
          pricingModel: true,
        },
      },
    },
    orderBy: [{ market: { region: { name: "asc" } } }, { market: { name: "asc" } }, { name: "asc" }],
  })) as FacilityStatusRow[];

  return facilities.map((f) => ({
    facilityId: f.id,
    facilityName: f.name,
    marketName: f.market.name,
    regionName: f.market.region.name,
    hasProfile: f.profile !== null,
    coreFieldsFilled: countCoreFieldsFilled(f.profile),
    coreFieldsTotal: CORE_FIELDS.length,
  }));
}

// ---------- Perfil completo (página de detalle por facility) ----------
// Los stats de historial (partidos confirmados, revenue) NO se guardan en
// FacilityProfile — se calculan al vuelo desde Game, igual que en el resto
// de la app. Es de solo lectura acá: resuelve "Games hosted historically" y
// "Revenue generated" del mapa de campos sin duplicar el dato.

type PeakWindowRow = { id: string; dayOfWeek: number; startHour: number; endHour: number };
type RelationshipEventRow = {
  id: string;
  type: string;
  date: Date;
  note: string;
  status: string | null;
  attachmentUrl: string | null;
};
// Superset de CoreProfileFields con el resto de columnas del perfil + las
// dos listas hijas — mismo motivo que FacilityStatusRow arriba.
type FacilityProfileFullRow = CoreProfileFields & {
  supportedFormats: string[];
  amenities: string[];
  amenitiesOther: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  paymentTerms: string | null;
  bookingTerms: string | null;
  cancellationTerms: string | null;
  depositAmount: number | null;
  depositNotes: string | null;
  fixedRate: number | null;
  revenueSharePct: number | null;
  discountAmount: number | null;
  discountPct: number | null;
  freeHoursPerMonth: number | null;
  peakWindows: PeakWindowRow[];
  events: RelationshipEventRow[];
};
type FacilityDetailRow = {
  id: string;
  name: string;
  market: { name: string; region: { name: string } };
  profile: FacilityProfileFullRow | null;
};

export async function getFacilityProfileDetail(facilityId: string) {
  const facility = (await prisma.facility.findUnique({
    where: { id: facilityId },
    select: {
      id: true,
      name: true,
      market: { select: { name: true, region: { select: { name: true } } } },
      profile: {
        include: {
          peakWindows: { orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }] },
          events: { orderBy: { date: "desc" } },
        },
      },
    },
  })) as FacilityDetailRow | null;
  if (!facility) return null;

  const [gamesHosted, revenueAgg] = await Promise.all([
    prisma.game.count({ where: { facilityId, status: GameStatus.CONFIRMED } }),
    prisma.game.aggregate({ where: { facilityId, status: GameStatus.CONFIRMED }, _sum: { eventRevenue: true } }),
  ]);

  return {
    facility: {
      id: facility.id,
      name: facility.name,
      marketName: facility.market.name,
      regionName: facility.market.region.name,
    },
    profile: facility.profile,
    stats: {
      gamesHosted,
      revenueGenerated: revenueAgg._sum.eventRevenue ?? 0,
    },
  };
}
