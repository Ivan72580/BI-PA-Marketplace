import { prisma } from "./prisma";
import { cached } from "./cache";

// ---------- Filtros disponibles (para los selectores de la UI) ----------

export const getFilterOptions = cached("getFilterOptions", async () => {
  const [regions, markets, facilities] = await Promise.all([
    prisma.region.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.market.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, regionId: true } }),
    prisma.facility.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, marketId: true } }),
  ]);

  return { regions, markets, facilities };
});

// Resuelve los nombres reales de la selección actual, para el breadcrumb.
export const resolveFilterNames = cached(
  "resolveFilterNames",
  async (filters: { regionId?: string; marketId?: string; facilityId?: string }) => {
    const [region, market, facility] = await Promise.all([
      filters.regionId ? prisma.region.findUnique({ where: { id: filters.regionId }, select: { name: true } }) : null,
      filters.marketId ? prisma.market.findUnique({ where: { id: filters.marketId }, select: { name: true, regionId: true } }) : null,
      filters.facilityId ? prisma.facility.findUnique({ where: { id: filters.facilityId }, select: { name: true, marketId: true } }) : null,
    ]);

    return {
      regionName: region?.name ?? null,
      marketName: market?.name ?? null,
      facilityName: facility?.name ?? null,
    };
  }
);
