import { Prisma } from "@prisma/client";

export type OverviewFilters = {
  regionId?: string; // East / West
  marketId?: string; // South Florida, Orlando, etc.
  facilityId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export function buildWhere(filters: OverviewFilters): Prisma.GameWhereInput {
  const where: Prisma.GameWhereInput = {};

  if (filters.dateFrom || filters.dateTo) {
    where.date = {};
    if (filters.dateFrom) where.date.gte = filters.dateFrom;
    if (filters.dateTo) where.date.lte = filters.dateTo;
  }

  if (filters.facilityId) {
    where.facilityId = filters.facilityId;
  } else if (filters.marketId) {
    where.facility = { marketId: filters.marketId };
  } else if (filters.regionId) {
    where.facility = { market: { regionId: filters.regionId } };
  }

  return where;
}

const CATEGORY_LABEL: Record<string, string> = {
  NOT_ENOUGH_PLAYERS: "Jugadores insuficientes",
  FACILITY_UNAVAILABLE: "Cancha no disponible",
  WEATHER: "Clima",
  MAINTENANCE: "Mantenimiento",
  HOLIDAY: "Feriado",
  OTHER: "Otro",
};

export function labelForCancellationCategory(cat: string) {
  return CATEGORY_LABEL[cat] ?? cat;
}

export const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const DAY_LABEL_ES: Record<string, string> = {
  Monday: "Lun", Tuesday: "Mar", Wednesday: "Mié", Thursday: "Jue", Friday: "Vie", Saturday: "Sáb", Sunday: "Dom",
};

// Umbrales compartidos entre módulos, para que un mismo criterio de
// "muestra mínima representativa" no quede duplicado (y potencialmente
// desincronizado) en cada archivo.
export const MIN_GAMES_FOR_RANKING = 10;
export const MIN_GAMES_FOR_CONTRIBUTION = 5;
export const MAX_NAMED_SEGMENTS = 20;

// Los partidos se agendan en general entre las 6AM y las 3AM del día
// siguiente — un orden calendario simple (00,01,02...23) corta esa sesión
// nocturna al medio y la separa del resto de la noche a la que pertenece.
// Este orden empieza en 6AM y da la vuelta por medianoche hasta las 5AM.
export function sortHoursByOperatingDay(hours: string[]): string[] {
  const key = (h: string) => (parseInt(h, 10) - 6 + 24) % 24;
  return [...hours].sort((a, b) => key(a) - key(b));
}
