import { GameReviewTag, AppReviewSource } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";

// ---------- Player Satisfaction ----------
// Dos fuentes independientes (ver el comentario en schema.prisma):
// GameReview (por partido/facility) y AppReview (tienda de apps, red
// completa). Se envuelve en cached() igual que el resto de queries.ts —
// esto se sincroniza por script (import-game-reviews.ts / import-app-reviews.ts),
// no se edita desde la UI.
//
// IMPORTANTE: playerPhoneHash nunca se selecciona ni se devuelve desde acá.
// Es un hash irreversible pensado solo para detectar coincidencias vía SQL
// (mismo jugador en >1 partido), nunca para mostrarse — así que ninguna
// función de este archivo lo expone, ni siquiera hasheado.

// Tipos explícitos para los resultados de Prisma — mismo motivo que en
// facilityProfile.ts/region.ts: el cliente generado en este sandbox está
// desactualizado y no conoce estos modelos todavía, así que sin esto el
// resultado cae en `any`.
type GameReviewRow = {
  rating: number;
  tags: GameReviewTag[];
  game: { facilityId: string; facility: { name: string; market: { name: string; region: { name: string } } } };
};
type RecentGameReviewRow = {
  id: string;
  date: Date;
  rating: number;
  tags: GameReviewTag[];
  reviewText: string | null;
  game: { facility: { name: string } };
};
type AppReviewAggRow = { source: AppReviewSource; rating: number; replied: boolean; replyTimeDays: number | null };
type RecentAppReviewRow = {
  id: string;
  reviewDate: Date;
  source: AppReviewSource;
  rating: number;
  reviewText: string | null;
  replied: boolean;
  replyText: string | null;
};

const RECENT_LIMIT = 30;
// Umbral para que un facility entre al ranking de calidad de campo — igual
// criterio que MIN_GAMES_FOR_RANKING en shared.ts: con muy pocas reviews el
// % no es representativo y solo agrega ruido al ranking.
const MIN_REVIEWS_FOR_FIELD_QUALITY_RANKING = 5;

const FIELD_QUALITY_POSITIVE = new Set<GameReviewTag>([GameReviewTag.FIELD_QUALITY_GREAT, GameReviewTag.FIELD_QUALITY_GOOD]);
const FIELD_QUALITY_NEGATIVE = new Set<GameReviewTag>([GameReviewTag.FIELD_CONDITIONS_ISSUES]);
const PLAYER_COMPLAINT_TAGS = new Set<GameReviewTag>([GameReviewTag.NOT_COMPETITIVE, GameReviewTag.ISSUES_WITH_OTHER_PLAYERS]);

export type GameReviewSummary = {
  totalReviews: number;
  averageRating: number | null;
  earliestDate: string | null; // ISO "YYYY-MM-DD" — mismo criterio que gamelist.ts
  latestDate: string | null;
  tagCounts: { tag: GameReviewTag; count: number; pctOfReviews: number }[];
};

export type FacilityFieldQualityRow = {
  facilityId: string;
  facilityName: string;
  marketName: string;
  regionName: string;
  totalReviews: number;
  averageRating: number;
  pctFieldQualityPositive: number;
  pctFieldQualityNegative: number;
};

export type RecentGameReview = {
  id: string;
  date: string; // ISO "YYYY-MM-DD"
  facilityName: string;
  rating: number;
  tags: GameReviewTag[];
  reviewText: string | null;
};

async function getGameReviewSatisfactionImpl(): Promise<{
  summary: GameReviewSummary;
  facilityFieldQuality: FacilityFieldQualityRow[];
  recentReviews: RecentGameReview[];
}> {
  const [reviews, recent, dateAgg] = await Promise.all([
    prisma.gameReview.findMany({
      select: {
        rating: true,
        tags: true,
        game: { select: { facilityId: true, facility: { select: { name: true, market: { select: { name: true, region: { select: { name: true } } } } } } } },
      },
    }) as unknown as Promise<GameReviewRow[]>,
    prisma.gameReview.findMany({
      orderBy: { date: "desc" },
      take: RECENT_LIMIT,
      select: { id: true, date: true, rating: true, tags: true, reviewText: true, game: { select: { facility: { select: { name: true } } } } },
    }) as unknown as Promise<RecentGameReviewRow[]>,
    prisma.gameReview.aggregate({ _min: { date: true }, _max: { date: true } }),
  ]);

  // ---------- Resumen general ----------
  const tagTally = new Map<GameReviewTag, number>();
  let ratingSum = 0;
  for (const r of reviews) {
    ratingSum += r.rating;
    for (const tag of r.tags) tagTally.set(tag, (tagTally.get(tag) ?? 0) + 1);
  }
  const totalReviews = reviews.length;
  const tagCounts = Array.from(tagTally.entries())
    .map(([tag, count]) => ({ tag, count, pctOfReviews: totalReviews > 0 ? count / totalReviews : 0 }))
    .sort((a, b) => b.count - a.count);

  const summary: GameReviewSummary = {
    totalReviews,
    averageRating: totalReviews > 0 ? ratingSum / totalReviews : null,
    earliestDate: dateAgg._min.date ? dateAgg._min.date.toISOString().slice(0, 10) : null,
    latestDate: dateAgg._max.date ? dateAgg._max.date.toISOString().slice(0, 10) : null,
    tagCounts,
  };

  // ---------- Ranking de calidad de campo por facility ----------
  // Único atributo de los 11 de "facility-specific feedback" del PDF que
  // este dataset resuelve directamente (ver mapa de campos) — el resto
  // sigue pendiente de fuente.
  type FacilityTally = {
    facilityName: string;
    marketName: string;
    regionName: string;
    totalReviews: number;
    ratingSum: number;
    positive: number;
    negative: number;
  };
  const byFacility = new Map<string, FacilityTally>();
  for (const r of reviews) {
    const key = r.game.facilityId;
    const entry =
      byFacility.get(key) ??
      ({
        facilityName: r.game.facility.name,
        marketName: r.game.facility.market.name,
        regionName: r.game.facility.market.region.name,
        totalReviews: 0,
        ratingSum: 0,
        positive: 0,
        negative: 0,
      } as FacilityTally);
    entry.totalReviews += 1;
    entry.ratingSum += r.rating;
    if (r.tags.some((t) => FIELD_QUALITY_POSITIVE.has(t))) entry.positive += 1;
    if (r.tags.some((t) => FIELD_QUALITY_NEGATIVE.has(t))) entry.negative += 1;
    byFacility.set(key, entry);
  }

  const facilityFieldQuality: FacilityFieldQualityRow[] = Array.from(byFacility.entries())
    .filter(([, v]) => v.totalReviews >= MIN_REVIEWS_FOR_FIELD_QUALITY_RANKING)
    .map(([facilityId, v]) => ({
      facilityId,
      facilityName: v.facilityName,
      marketName: v.marketName,
      regionName: v.regionName,
      totalReviews: v.totalReviews,
      averageRating: v.ratingSum / v.totalReviews,
      pctFieldQualityPositive: v.positive / v.totalReviews,
      pctFieldQualityNegative: v.negative / v.totalReviews,
    }))
    // Peor calidad de campo primero — es lo que Leadership necesita accionar.
    .sort((a, b) => b.pctFieldQualityNegative - a.pctFieldQualityNegative || a.pctFieldQualityPositive - b.pctFieldQualityPositive);

  const recentReviews: RecentGameReview[] = recent.map((r) => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    facilityName: r.game.facility.name,
    rating: r.rating,
    tags: r.tags,
    reviewText: r.reviewText,
  }));

  return { summary, facilityFieldQuality, recentReviews };
}

export const getGameReviewSatisfaction = cached("getGameReviewSatisfaction", getGameReviewSatisfactionImpl);

// ---------- Player complaints (tags de conflicto entre jugadores) ----------
// Señal nueva que no estaba en el pedido original del PDF pero que el
// dataset sí habilita — se muestra junto al resumen, no como su propia
// sección, para no inflar el alcance de esta primera versión.
export type PlayerComplaintsSummary = { totalReviewsWithComplaint: number; pctOfReviews: number };

export async function getPlayerComplaintsSummary(): Promise<PlayerComplaintsSummary> {
  const { summary } = await getGameReviewSatisfaction();
  const totalReviewsWithComplaint = summary.tagCounts.filter((t) => PLAYER_COMPLAINT_TAGS.has(t.tag)).reduce((sum, t) => sum + t.count, 0);
  return {
    totalReviewsWithComplaint,
    pctOfReviews: summary.totalReviews > 0 ? totalReviewsWithComplaint / summary.totalReviews : 0,
  };
}

// ---------- App Store / Play Store reviews ----------

export type AppReviewSummary = {
  totalReviews: number;
  averageRating: number | null;
  byPlatform: { source: AppReviewSource; count: number; averageRating: number }[];
  replyRate: number;
  averageReplyTimeDays: number | null;
};

export type RecentAppReview = {
  id: string;
  reviewDate: string; // ISO "YYYY-MM-DD"
  source: AppReviewSource;
  rating: number;
  reviewText: string | null;
  replied: boolean;
  replyText: string | null;
};

async function getAppReviewSatisfactionImpl(): Promise<{ summary: AppReviewSummary; recentReviews: RecentAppReview[] }> {
  const [reviews, recent] = await Promise.all([
    prisma.appReview.findMany({ select: { source: true, rating: true, replied: true, replyTimeDays: true } }) as unknown as Promise<AppReviewAggRow[]>,
    prisma.appReview.findMany({
      orderBy: { reviewDate: "desc" },
      take: RECENT_LIMIT,
      select: { id: true, reviewDate: true, source: true, rating: true, reviewText: true, replied: true, replyText: true },
    }) as unknown as Promise<RecentAppReviewRow[]>,
  ]);

  const totalReviews = reviews.length;
  const platformTally = new Map<AppReviewSource, { count: number; ratingSum: number }>();
  let ratingSum = 0;
  let repliedCount = 0;
  let replyTimeSum = 0;
  let replyTimeCount = 0;

  for (const r of reviews) {
    ratingSum += r.rating;
    if (r.replied) repliedCount += 1;
    // Reply time negativo = la respuesta quedó fechada antes que la review
    // en el export de origen (dato del dashboard, no algo que generemos
    // nosotros) — se excluye del promedio para no distorsionarlo.
    if (r.replyTimeDays !== null && r.replyTimeDays >= 0) {
      replyTimeSum += r.replyTimeDays;
      replyTimeCount += 1;
    }
    const entry = platformTally.get(r.source) ?? { count: 0, ratingSum: 0 };
    entry.count += 1;
    entry.ratingSum += r.rating;
    platformTally.set(r.source, entry);
  }

  const summary: AppReviewSummary = {
    totalReviews,
    averageRating: totalReviews > 0 ? ratingSum / totalReviews : null,
    byPlatform: Array.from(platformTally.entries()).map(([source, v]) => ({ source, count: v.count, averageRating: v.ratingSum / v.count })),
    replyRate: totalReviews > 0 ? repliedCount / totalReviews : 0,
    averageReplyTimeDays: replyTimeCount > 0 ? replyTimeSum / replyTimeCount : null,
  };

  const recentReviews: RecentAppReview[] = recent.map((r) => ({
    id: r.id,
    reviewDate: r.reviewDate.toISOString().slice(0, 10),
    source: r.source,
    rating: r.rating,
    reviewText: r.reviewText,
    replied: r.replied,
    replyText: r.replyText,
  }));

  return { summary, recentReviews };
}

export const getAppReviewSatisfaction = cached("getAppReviewSatisfaction", getAppReviewSatisfactionImpl);
