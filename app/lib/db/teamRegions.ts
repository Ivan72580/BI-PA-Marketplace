import { cookies } from "next/headers";
import { getFilterOptions } from "./queries";
import { parseTeamRegions, TEAM_REGIONS_COOKIE } from "../teamRegions";

/** Regiones elegidas por la persona (ids válidos); vacío = todas. */
export async function getTeamRegionIds(): Promise<string[]> {
  const [store, { regions }] = await Promise.all([cookies(), getFilterOptions()]);
  return parseTeamRegions(store.get(TEAM_REGIONS_COOKIE)?.value, regions.map((r) => r.id));
}
