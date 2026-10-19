import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { FacilityNow } from "../lib/db/facilityNow";
import FacilitySearch from "./FacilitySearch";
import DatePicker from "./DatePicker";
import LayerNav from "./LayerNav";

// Cabecera fija del análisis de facility: quién es, hasta qué día llegan los datos, selector del día de
// referencia, cambio rápido de facility y la barra de capas (anclas dentro de la misma página). Las capas que
// todavía no están construidas figuran apagadas, así se ve de entrada cómo va a quedar la página completa.

export const LAYERS = [
  { id: "ahora", key: "now", built: true },
  { id: "pronostico", key: "forecast", built: true },
  { id: "slots", key: "slots", built: true },
  { id: "demanda", key: "demand", built: true },
  { id: "precio", key: "price", built: true },
  { id: "tendencia", key: "trend", built: true },
  { id: "posicion", key: "position", built: true },
  { id: "relacion", key: "relation", built: true },
] as const;

export default async function Facility360Header({
  data,
  dateParam,
  facilities,
  markets,
}: {
  data: FacilityNow;
  dateParam?: string;
  facilities: { id: string; name: string; marketId: string }[];
  markets: { id: string; name: string; regionId: string }[];
}) {
  const [t, locale] = await Promise.all([getTranslations("Facility360"), getLocale()]);
  const lc = locale === "en" ? "en-US" : "es-AR";
  const dateLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lc, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const { identity: f } = data;
  const zone = new URLSearchParams({ regionId: f.regionId, marketId: f.marketId });
  const overviewHref = `/?${new URLSearchParams({ regionId: f.regionId, marketId: f.marketId, facilityId: f.id }).toString()}`;
  const isPast = data.refISO !== data.latestISO;

  return (
    <>
      <header className="mb-4">
        <Link href={`/facility?${zone.toString()}`} className="text-xs text-brand hover:underline">← {t("header.back")}</Link>
        <div className="flex flex-wrap items-start justify-between gap-4 mt-1">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold text-ink leading-tight">{f.name}</h1>
            <div className="text-sm text-ink-faint mt-1">{f.marketName} · {f.regionName}</div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-xs">
              <span className="rounded-full bg-surface-sunken text-ink-muted px-2.5 py-1">{t("header.dataAsOf", { date: dateLabel(data.latestISO) })}</span>
              <label className="flex items-center gap-2 text-ink-muted">
                {t("header.refLabel")}
                <DatePicker value={data.refISO} paramName="date" />
              </label>
              {isPast && (
                <Link href={`/facility?facilityId=${f.id}`} className="text-brand hover:underline">{t("header.resetRef")}</Link>
              )}
            </div>
          </div>
          <div className="w-full sm:w-72 space-y-2">
            <FacilitySearch
              facilities={facilities}
              markets={markets}
              variant="panel"
              placeholder={t("header.switch")}
              emptyMessageTemplate={t("landing.searchEmpty", { query: "{query}" })}
              basePath="/facility"
              extraParams={{ date: dateParam }}
            />
            <Link href={overviewHref} className="block text-right text-xs text-ink-faint hover:text-brand">{t("header.overview")}</Link>
          </div>
        </div>
      </header>

      <LayerNav layers={LAYERS.map((l) => ({ id: l.id, label: t(`nav.${l.key}`), built: l.built }))} label={t("nav.label")} soon={t("nav.soon")} />
    </>
  );
}
