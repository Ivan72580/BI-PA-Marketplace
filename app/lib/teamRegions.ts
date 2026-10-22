// Regiones con las que trabaja la persona en el módulo Equipo (Registro semanal, Bitácora, Facility Profile).
// Es una preferencia de visualización, no un permiso: se cambia en cualquier momento y nunca bloquea una región.
// Vive en una cookie (como el último módulo): vacía = todas las regiones.

export const TEAM_REGIONS_COOKIE = "plei_team_regions";

export function parseTeamRegions(raw: string | undefined, validIds: string[]): string[] {
  if (!raw) return [];
  const valid = new Set(validIds);
  return [...new Set(raw.split(",").filter((id) => valid.has(id)))];
}
