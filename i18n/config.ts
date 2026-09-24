// Configuración central de idiomas soportados. Agregar un idioma nuevo más
// adelante es solo sumarlo a `locales` + su archivo en messages/ — no
// requiere cambios en el resto de la infraestructura (request.ts, la server
// action, el switcher).
export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "es";

export const LOCALE_COOKIE = "locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

// Elige, de entre los idiomas soportados, el primero que pide el header
// Accept-Language del navegador. El header ya llega en orden de preferencia
// (ej. "en-US,en;q=0.9,es;q=0.8"), así que alcanza con tomar el primer
// candidato que matcheemos — no hace falta parsear los valores de "q".
export function preferredBrowserLocale(acceptLanguageHeader: string | null | undefined): Locale | null {
  if (!acceptLanguageHeader) return null;
  const candidates = acceptLanguageHeader
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase())
    .filter(Boolean) as string[];

  for (const candidate of candidates) {
    const base = candidate.split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}
