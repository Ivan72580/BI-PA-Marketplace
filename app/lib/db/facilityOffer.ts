import { prisma } from "./prisma";
import { computeObservedOffer, OFFER_WINDOW_DAYS, type DeclarationLite, type ObservedOffer, type OfferModality } from "../facilityOffer";

export type OfferDeclarationRow = DeclarationLite & { id: string; otherOrganizers: boolean | null; note: string | null; authorName: string | null };

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Declaraciones (la vigente es la primera) y la oferta observada de los últimos 90 días de una facility. */
export async function getFacilityOffer(facilityId: string, today: string): Promise<{ declarations: OfferDeclarationRow[]; observed: ObservedOffer }> {
  const [decl, games] = await Promise.all([
    prisma.facilityOfferDeclaration.findMany({
      where: { facilityId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { author: { select: { name: true, email: true } } },
    }),
    prisma.game.findMany({
      where: { facilityId, date: { gte: new Date(`${addDays(today, -OFFER_WINDOW_DAYS + 1)}T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) } },
      select: { date: true, time: true },
    }),
  ]);
  return {
    declarations: decl.map((d) => ({
      id: d.id,
      modality: d.modality as OfferModality,
      authorId: d.authorId,
      createdAt: d.createdAt.getTime(),
      otherOrganizers: d.otherOrganizers,
      note: d.note,
      authorName: d.author ? d.author.name || d.author.email.split("@")[0] : null,
    })),
    observed: computeObservedOffer(games.map((g) => ({ date: g.date.toISOString().slice(0, 10), time: g.time }))),
  };
}
