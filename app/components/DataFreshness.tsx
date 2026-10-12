import { getLocale, getTranslations } from "next-intl/server";
import { getLatestDataDate } from "../lib/db/freshness";
import { todayISO } from "../lib/period";

// Pasados estos días sin datos nuevos el texto vira a ámbar. Pequeño y a
// propósito poco llamativo: el indicador principal de que los datos no se
// actualizan sigue siendo la propia web.
const STALE_AFTER_DAYS = 3;

export default async function DataFreshness() {
  const latest = await getLatestDataDate();
  if (!latest) return null;

  const [t, locale] = await Promise.all([getTranslations("TopNav"), getLocale()]);
  const lagDays = Math.round((Date.parse(`${todayISO()}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 86_400_000);
  const stale = lagDays >= STALE_AFTER_DAYS;
  const label = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${latest}T00:00:00Z`));

  return (
    <span
      className={`hidden md:inline text-[11px] whitespace-nowrap ${stale ? "text-amber-300" : "text-white/50"}`}
      title={stale ? t("dataThroughStale", { days: lagDays }) : undefined}
    >
      {t("dataThrough", { date: label })}
    </span>
  );
}
