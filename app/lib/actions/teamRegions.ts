"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getFilterOptions } from "../db/queries";
import { parseTeamRegions, TEAM_REGIONS_COOKIE } from "../teamRegions";

export async function setTeamRegions(ids: string[]) {
  const { regions } = await getFilterOptions();
  const valid = parseTeamRegions(ids.join(","), regions.map((r) => r.id));
  (await cookies()).set(TEAM_REGIONS_COOKIE, valid.join(","), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  for (const p of ["/weekly-log", "/facility-log", "/facility-profile"]) revalidatePath(p);
}
