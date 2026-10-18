import Link from "next/link";
import ChangeBadge from "./ChangeBadge";
import Glossary from "./Glossary";
import { weekdayAbbr } from "../lib/db/weekday";
import { labelForCancellationCategory } from "../lib/db/shared";
import type { ForecastWatch, WatchItem } from "../lib/db/forecastWatch";
import { explainDown, explainUp, type SlotShift } from "../lib/forecastWatchCalc";
import type { Locale } from "@/i18n/config";

// "Facilities a vigilar" de Pronóstico. Sin filtro: una caja por región (East / West) con las que
// proyectan baja. Con región o market: a la izquierda las que proyectan baja y a la derecha las que
// proyectan alza; con market, además, el desglose de las que más pesan en la proyección. Cada
// facility trae una explicación corta (qué cambió entre el último período y el anterior) y una
// sugerencia. El criterio y los umbrales están en app/lib/forecastWatchCalc.ts.

type T = (key: string, values?: Record<string, string | number>) => string;

const signed = (n: number, digits = 0) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;

function Explanation({ item, t, locale }: { item: WatchItem; t: T; locale: Locale }) {
  const d = item.driver;
  if (!d) return <p className="text-[11px] text-ink-faint">{t("watch.noDriver")}</p>;

  const slotList = (slots: SlotShift[]) => slots.map((s) => `${weekdayAbbr(s.dayOfWeek, locale)} ${s.time} (${s.prior}→${s.recent})`).join(", ");
  const base = { days: d.days, confirmedRecent: d.confirmed.recent, confirmedPrior: d.confirmed.prior };

  if (item.direction === "up") {
    const up = explainUp(d);
    return (
      <div className="text-[11px] text-ink-muted leading-snug space-y-1">
        <p>{t("watch.upSummary", { ...base, rate: `${(item.predictedRate * 100).toFixed(0)}%` })}</p>
        {up.slots.length > 0 && <p>{t("watch.slotsGained", { list: slotList(up.slots) })}</p>}
        <p className="rounded-md bg-brand-soft/70 text-brand px-2 py-1"><span className="font-semibold">{t("watch.suggestionLabel")}</span> {t("watch.suggest.up")}</p>
      </div>
    );
  }

  const down = explainDown(d);
  const reasonList = down.reasons
    .map((r) => `${r.category === "UNSPECIFIED" ? t("watch.reasonUnspecified") : labelForCancellationCategory(r.category, locale)} (${r.prior}→${r.recent})`)
    .join(", ");
  return (
    <div className="text-[11px] text-ink-muted leading-snug space-y-1">
      <p>{t("watch.downSummary", { ...base, cancelledRecent: d.cancelled.recent, cancelledPrior: d.cancelled.prior })}</p>
      {down.supply && <p>{t("watch.supply", { prior: down.supply.prior, recent: down.supply.recent })}</p>}
      {down.reasons.length > 0 && <p>{t(down.growing ? "watch.reasonsGrowing" : "watch.reasonsTop", { list: reasonList })}</p>}
      {down.slots.length > 0 && <p>{t("watch.slotsLost", { list: slotList(down.slots) })}</p>}
      <p className="rounded-md bg-warning-soft text-warning px-2 py-1"><span className="font-semibold">{t("watch.suggestionLabel")}</span> {t(`watch.suggest.${down.suggestion}`)}</p>
    </div>
  );
}

function Row({ item, t, locale, hrefFor }: { item: WatchItem; t: T; locale: Locale; hrefFor: (i: WatchItem) => string }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={hrefFor(item)} className="text-sm font-medium text-ink hover:text-brand truncate block">{item.facilityName}</Link>
          <div className="text-[11px] text-ink-faint truncate">{item.marketName}</div>
        </div>
        <div className="flex flex-col items-end shrink-0 text-xs text-ink-faint">
          <ChangeBadge value={item.rateDelta} unit="pts" />
          <span>
            {item.direction === "up"
              ? t("watch.confirmedDelta", { n: signed(item.confirmedDelta) })
              : t("watch.projDown", { delta: signed(item.confirmedDelta), n: item.predictedCancelled })}
          </span>
        </div>
      </div>
      <Explanation item={item} t={t} locale={locale} />
    </li>
  );
}

function Box({ title, subtitle, empty, items, t, locale, hrefFor }: {
  title: string; subtitle: string; empty: string; items: WatchItem[]; t: T; locale: Locale; hrefFor: (i: WatchItem) => string;
}) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm p-5">
      <h3 className="text-sm font-medium text-ink mb-0.5">{title}</h3>
      <p className="text-xs text-ink-faint mb-4">{subtitle}</p>
      {items.length === 0 ? (
        <div className="text-sm text-ink-faint">{empty}</div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((i) => <Row key={i.facilityId} item={i} t={t} locale={locale} hrefFor={hrefFor} />)}
        </ul>
      )}
    </div>
  );
}

function Breakdown({ items, t, hrefFor }: { items: WatchItem[]; t: T; hrefFor: (i: WatchItem) => string }) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm p-5">
      <h3 className="text-sm font-medium text-ink mb-0.5">{t("watch.breakdown.title")}</h3>
      <p className="text-xs text-ink-faint mb-4">{t("watch.breakdown.subtitle")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-[11px] text-ink-faint border-b border-border">
              <th className="font-medium pb-2 pr-3">{t("watch.breakdown.facility")}</th>
              <th className="font-medium pb-2 px-2 text-right">{t("watch.breakdown.scheduled")}</th>
              <th className="font-medium pb-2 px-2 text-right">{t("watch.breakdown.confirmed")}</th>
              <th className="font-medium pb-2 px-2 text-right">{t("watch.breakdown.vsAvg")}</th>
              <th className="font-medium pb-2 px-2 text-right">{t("watch.breakdown.rate")}</th>
              <th className="font-medium pb-2 pl-2 text-right">{t("watch.breakdown.leadTime")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((i) => {
              const lt = i.driver?.leadTime;
              const ltDelta = lt && lt.recent !== null && lt.prior !== null ? lt.recent - lt.prior : null;
              const ltTone = ltDelta === null ? "text-ink-faint" : ltDelta <= -1 ? "text-warning" : "text-ink-muted";
              return (
                <tr key={i.facilityId}>
                  <td className="py-2 pr-3"><Link href={hrefFor(i)} className="font-medium text-ink hover:text-brand">{i.facilityName}</Link></td>
                  <td className="py-2 px-2 text-right tabular-nums">{Math.round(i.predictedGames)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{Math.round(i.predictedConfirmed)}</td>
                  <td className={`py-2 px-2 text-right tabular-nums font-semibold ${i.confirmedDelta < 0 ? "text-danger" : "text-brand"}`}>{signed(i.confirmedDelta, 1)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{(i.predictedRate * 100).toFixed(0)}% <ChangeBadge value={i.rateDelta} unit="pts" /></td>
                  <td className={`py-2 pl-2 text-right tabular-nums ${ltTone}`} title={t("watch.breakdown.leadTimeHint")}>
                    {lt && lt.recent !== null ? `${lt.recent.toFixed(0)} h` : "—"}
                    {ltDelta !== null && <span className="text-[11px]"> ({Math.abs(ltDelta) >= 1 ? `${signed(ltDelta)} h` : "="})</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Glossary
        items={[
          { term: t("watch.glossary.vsAvg.term"), def: t("watch.glossary.vsAvg.def") },
          { term: t("watch.glossary.leadTime.term"), def: t("watch.glossary.leadTime.def") },
        ]}
      />
    </div>
  );
}

export default function ForecastWatchlist({
  watch, t, locale, rangeLabel, hrefFor,
}: {
  watch: ForecastWatch;
  t: T;
  locale: Locale;
  rangeLabel: string;
  hrefFor: (i: WatchItem) => string;
}) {
  return (
    <div className="space-y-5">
      {watch.scope === "network" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {watch.regions.map((r) => (
            <Box key={r.regionId} title={t("watch.regionTitle", { region: r.regionName })} subtitle={t("risk.subtitle", { range: rangeLabel })}
              empty={t("watch.regionEmpty", { region: r.regionName })} items={r.down} t={t} locale={locale} hrefFor={hrefFor} />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Box title={t("risk.title")} subtitle={t("risk.subtitle", { range: rangeLabel })} empty={t("risk.empty")} items={watch.down} t={t} locale={locale} hrefFor={hrefFor} />
            <Box title={t("watch.up.title")} subtitle={t("watch.up.subtitle", { range: rangeLabel })} empty={t("watch.up.empty")} items={watch.up} t={t} locale={locale} hrefFor={hrefFor} />
          </div>
          {watch.scope === "market" && watch.breakdown.length > 0 && <Breakdown items={watch.breakdown} t={t} hrefFor={hrefFor} />}
        </>
      )}
      <Glossary items={[{ term: t("glossary.risk.term"), def: t("glossary.risk.def") }]} />
    </div>
  );
}
