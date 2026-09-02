import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, labelForCancellationCategory, type OverviewFilters } from "./shared";

export type GameListItem = {
  id: number;
  date: string;
  dayOfWeek: string;
  time: string;
  facilityName: string;
  status: "CONFIRMED" | "CANCELLED";
  finalPlayers: number;
  maxPlayers: number;
  cancellationReason: string | null;
};

async function getGameListImpl(filters: OverviewFilters, limit = 100) {
  const where = buildWhere(filters);

  const [games, total] = await Promise.all([
    prisma.game.findMany({
      where,
      orderBy: { date: "desc" },
      take: limit,
      select: {
        id: true,
        date: true,
        time: true,
        dayOfWeek: true,
        status: true,
        finalPlayers: true,
        maxPlayers: true,
        cancellationCategory: true,
        facility: { select: { name: true } },
      },
    }),
    prisma.game.count({ where }),
  ]);

  const items: GameListItem[] = games.map((g) => ({
    id: g.id,
    date: g.date.toISOString().slice(0, 10),
    dayOfWeek: g.dayOfWeek,
    time: g.time,
    facilityName: g.facility.name,
    status: g.status,
    finalPlayers: g.finalPlayers,
    maxPlayers: g.maxPlayers,
    cancellationReason: g.cancellationCategory ? labelForCancellationCategory(g.cancellationCategory) : null,
  }));

  return { items, total };
}

export const getGameList = cached("getGameList", getGameListImpl);
