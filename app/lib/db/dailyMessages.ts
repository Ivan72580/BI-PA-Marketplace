import { IntlMessageFormat } from "intl-messageformat";
import type { Locale } from "@/i18n/config";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

// Traductor puro para usar DENTRO de funciones cacheadas con
// unstable_cache (ver app/lib/db/cache.ts). getTranslations()/getLocale()
// de "next-intl/server" NO sirven ahí: internamente tocan APIs dinámicas de
// Next.js (headers()) para resolver la request, incluso pasándoles un
// `locale` explícito — y Next.js prohíbe leer esas APIs dentro de un scope
// de unstable_cache:
//   "Route /daily used 'headers' inside a function cached with
//   unstable_cache(...). Accessing Dynamic data sources inside a cache
//   scope is not supported."
// Este helper lee los mensajes directamente de los JSON estáticos (mismo
// contenido que consume next-intl) y los formatea con intl-messageformat
// —la misma librería que next-intl usa por debajo— sin tocar ninguna API
// de request: es puro y síncrono, seguro de llamar desde cualquier función
// cacheada. `locale` sigue entrando como argumento explícito de la función
// cacheada (necesario para que forme parte de la clave de caché); esto
// solo cambia CÓMO se resuelve el texto una vez adentro.

const MESSAGES: Record<Locale, Record<string, unknown>> = { es, en };

function getNested(obj: Record<string, unknown>, path: string): string {
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
  if (typeof value !== "string") {
    throw new Error(`Missing Daily message for key "${path}"`);
  }
  return value;
}

export type DailyTranslator = (key: string, values?: Record<string, string | number>) => string;

export function getDailyTranslator(locale: Locale): DailyTranslator {
  const daily = (MESSAGES[locale]?.Daily ?? MESSAGES.es.Daily) as Record<string, unknown>;
  return (key, values) => {
    const template = getNested(daily, key);
    return new IntlMessageFormat(template, locale).format(values) as string;
  };
}
