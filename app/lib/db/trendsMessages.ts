import { IntlMessageFormat } from "intl-messageformat";
import type { Locale } from "@/i18n/config";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

// Traductor puro para usar DENTRO de funciones cacheadas con
// unstable_cache (ver app/lib/db/cache.ts) — mismo patrón que
// app/lib/db/dailyMessages.ts (ver ese archivo para la explicación
// completa de por qué getTranslations()/getLocale() de "next-intl/server"
// no se pueden usar ahí, incluso pasándoles un `locale` explícito). Este
// helper es el equivalente para el namespace "Trends", usado por
// generateCellInsight/generateSlotInsights (dentro de getSlotConsistency)
// y por el label "Sem N"/"Wk N" de getSeasonalWindowPattern.

const MESSAGES: Record<Locale, Record<string, unknown>> = { es, en };

function getNested(obj: Record<string, unknown>, path: string): string {
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
  if (typeof value !== "string") {
    throw new Error(`Missing Trends message for key "${path}"`);
  }
  return value;
}

export type TrendsTranslator = (key: string, values?: Record<string, string | number>) => string;

export function getTrendsTranslator(locale: Locale): TrendsTranslator {
  const trends = (MESSAGES[locale]?.Trends ?? MESSAGES.es.Trends) as Record<string, unknown>;
  return (key, values) => {
    const template = getNested(trends, key);
    return new IntlMessageFormat(template, locale).format(values) as string;
  };
}
