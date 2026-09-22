import type { Locale } from "@/i18n/config";

// Nombres de día de semana para la página /daily, indexados por la clave
// canónica en inglés que usa el dato crudo (Game.dayOfWeek / DAY_ORDER en
// shared.ts). No reutiliza DAY_LABEL_ES de shared.ts a propósito: ese mapa
// lo siguen usando Trends/Market (fuera de alcance de esta ronda) y solo
// tiene la forma abreviada en español — tocarlo ahí tendría un radio de
// impacto mucho mayor al de esta página. Este archivo es exclusivo de
// /daily y de app/lib/db/daily.ts.
const ABBR: Record<Locale, Record<string, string>> = {
  es: { Monday: "Lun", Tuesday: "Mar", Wednesday: "Mié", Thursday: "Jue", Friday: "Vie", Saturday: "Sáb", Sunday: "Dom" },
  en: { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" },
};

const SINGULAR: Record<Locale, Record<string, string>> = {
  es: { Monday: "lunes", Tuesday: "martes", Wednesday: "miércoles", Thursday: "jueves", Friday: "viernes", Saturday: "sábado", Sunday: "domingo" },
  en: { Monday: "Monday", Tuesday: "Tuesday", Wednesday: "Wednesday", Thursday: "Thursday", Friday: "Friday", Saturday: "Saturday", Sunday: "Sunday" },
};

// Plural correcto en español: lunes/martes/miércoles/jueves/viernes ya son
// invariantes (no llevan "s"), solo sábado/domingo pluralizan agregando
// "s". El código anterior de esta página armaba el plural con
// `dayLabel.toLowerCase() + "s"` sobre la ABREVIATURA de 3 letras (ej.
// "Lun" -> "luns"), que nunca fue una palabra real en español — bug
// preexistente, no introducido por esta traducción. Queda corregido acá de
// paso, ya que había que tocar este mismo texto para traducirlo.
const PLURAL: Record<Locale, Record<string, string>> = {
  es: { Monday: "lunes", Tuesday: "martes", Wednesday: "miércoles", Thursday: "jueves", Friday: "viernes", Saturday: "sábados", Sunday: "domingos" },
  en: { Monday: "Mondays", Tuesday: "Tuesdays", Wednesday: "Wednesdays", Thursday: "Thursdays", Friday: "Fridays", Saturday: "Saturdays", Sunday: "Sundays" },
};

export function weekdayAbbr(dow: string, locale: Locale): string {
  return ABBR[locale]?.[dow] ?? dow;
}
export function weekdaySingular(dow: string, locale: Locale): string {
  return SINGULAR[locale]?.[dow] ?? dow;
}
export function weekdayPlural(dow: string, locale: Locale): string {
  return PLURAL[locale]?.[dow] ?? dow;
}
