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
