import { prisma } from "./prisma";
import { cached } from "./cache";
import { combineFormatLabel } from "./format";
import { buildWhere, labelForCancellationCategory, type OverviewFilters } from "./shared";
import type { Locale } from "@/i18n/config";

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
  fieldLabel: string; // ej "Indoor 7v7", o solo "7v7" si no hay tipo de cancha específico
};

type GameListRow = {
  id: number;
  date: Date;
  time: string;
  dayOfWeek: string;
  status: "CONFIRMED" | "CANCELLED";
  finalPlayers: number;
  maxPlayers: number;
  gameSize: string | null;
  fieldType: string | null;
  cancellationCategory: import("@prisma/client").CancellationCategory | null;
  facility: { name: string };
};

// `locale` con default "es" — mismo criterio que overview.ts/heatmap.ts: el
// único caller de este momento (trends/page.tsx, para DetalleTable) ya
// resuelve el locale real vía getLocale() y lo pasa.
async function getGameListImpl(filters: OverviewFilters, limit = 100, locale: Locale = "es") {
  const where = buildWhere(filters);

  const [games, total] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.game.findMany as any)({
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
        gameSize: true,
        fieldType: true,
        cancellationCategory: true,
        facility: { select: { name: true } },
      },
    }) as Promise<GameListRow[]>,
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
    cancellationReason: g.cancellationCategory ? labelForCancellationCategory(g.cancellationCategory, locale) : null,
    fieldLabel: combineFormatLabel(g.gameSize, g.fieldType, g.maxPlayers),
  }));

  return { items, total };
}

export const getGameList = cached("getGameList", getGameListImpl);
