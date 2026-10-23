import { getLocale, getTranslations } from "next-intl/server";
import type { FacilityNow } from "../lib/db/facilityNow";
import { getFacilityPlan } from "../lib/db/queries";
import type { SeriesDay, NowAlert } from "../lib/facilityNowCalc";
import { labelForCancellationCategory } from "../lib/db/shared";
import { weekdayAbbr, weekdayPlural } from "../lib/db/weekday";
import { RESERVE_MIN_RATE } from "../lib/reserveAdvice";
import { MUST_SCHEDULE_MIN_RATE } from "../lib/mustSchedule";
import type { Locale } from "@/i18n/config";
import LayerSection from "./LayerSection";
import Glossary from "./Glossary";
import Facility360NowPanel, { type ReserveItem } from "./Facility360NowPanel";
import RecentGamesTable, { type RecentRow } from "./RecentGamesTable";

// Capa 1 del análisis de facility: "Ahora". Panorama de día, semana y mes (selector en la misma tarjeta) con
// variación contra el período anterior y el market, cancelaciones con el detalle de cancha no disponible, los
// últimos 28 días día por día y los partidos recientes. Definiciones: app/lib/metrics.ts y facilityNowCalc.ts.

type T = (key: string, values?: Record<string, string | number>) => string;
const MAX_RESERVE_ITEMS = 4;

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(0)}%`);
const pct1 = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);

function AlertChips({ alerts, t }: { alerts: NowAlert[]; t: T }) {
  if (alerts.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {alerts.map((a) =>
        a.kind === "field" ? (
          <li key="field" className="rounded-full bg-warning-soft text-warning px-3 py-1.5 text-xs font-semibold">
            ⚠ {t("now.alert.field", { n: a.n, days: a.days, pct: a.share === null ? "—" : pct1(a.share) })}
          </li>
        ) : (
          <li key="drop" className="rounded-full bg-danger-soft text-danger px-3 py-1.5 text-xs font-semibold">
            ▼ {t("now.alert.demandDrop", { from: pct(a.from), to: pct(a.to), pts: Math.abs(a.pts * 100).toFixed(0) })}
          </li>
        )
      )}
    </ul>
  );
}


function DailyBars({ series, t, lc, locale }: { series: SeriesDay[]; t: T; lc: string; locale: Locale }) {
  const H = 130;
  const max = Math.max(1, ...series.map((d) => d.confirmed + d.demandCancelled + d.fieldUnavailable + d.other));
  const full = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lc, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lc, { day: "numeric", month: "numeric", timeZone: "UTC" });
  const seg = (n: number) => (n / max) * H;
  return (
    <div className="rounded-2xl bg-surface shadow-sm p-5">
      <h3 className="text-sm font-medium text-ink">{t("now.chart.title", { n: series.length })}</h3>
      <div className="overflow-x-auto mt-4">
        <div className="flex items-end gap-1 min-w-[840px]">
          {series.map((d) => {
            const total = d.confirmed + d.demandCancelled + d.fieldUnavailable + d.other;
            const base = d.confirmed + d.demandCancelled;
            const title = `${full(d.date)} · ${t("now.chart.tip", { c: d.confirmed, dm: d.demandCancelled, f: d.fieldUnavailable, o: d.other, rate: base > 0 ? pct(d.confirmed / base) : "—" })}`;
            const weekend = ["Saturday", "Sunday"].includes(dow(d.date));
            return (
              <div key={d.date} className="flex-1 min-w-0 flex flex-col items-stretch" title={title}>
                <div className="flex flex-col-reverse items-stretch justify-start" style={{ height: H }}>
                  {total === 0 ? <div className="h-0.5 rounded bg-surface-sunken" /> : (
                    <>
                      <div className="bg-brand-fill" style={{ height: seg(d.confirmed) }} />
                      <div className="bg-danger-fill" style={{ height: seg(d.demandCancelled) }} />
                      <div className="bg-warning-fill" style={{ height: seg(d.fieldUnavailable) }} />
                      <div className="bg-ink-faint/50 rounded-t-sm" style={{ height: seg(d.other) }} />
                    </>
                  )}
                </div>
                <div className={`mt-1.5 text-center leading-tight ${weekend ? "text-ink font-semibold" : "text-ink-faint"}`}>
                  <div className="text-[9px] uppercase">{weekdayAbbr(dow(d.date), locale)}</div>
                  <div className="text-[9px] tabular-nums">{short(d.date)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-brand-fill" aria-hidden="true" />{t("now.chart.confirmed")}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-danger-fill" aria-hidden="true" />{t("now.chart.demand")}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-warning-fill" aria-hidden="true" />{t("now.chart.field")}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-ink-faint/50" aria-hidden="true" />{t("now.chart.other")}</span>
      </div>
    </div>
  );
}

export default async function Facility360Now({ data }: { data: FacilityNow }) {
  const [tr, locale, plan] = await Promise.all([getTranslations("Facility360"), getLocale(), getFacilityPlan(data.identity.id)]);
  const t = tr as unknown as T;
  const lc = locale === "en" ? "en-US" : "es-AR";
  const loc = locale as Locale;

  // Slots donde conviene reservar la cancha (misma regla que Pronóstico): firmes primero.
  const reserveAll = (plan?.slots ?? []).filter((s) => s.reserve)
    .sort((a, b) => (a.reserve!.level === b.reserve!.level ? (b.reserve!.ratio ?? 0) - (a.reserve!.ratio ?? 0) : a.reserve!.level === "strong" ? -1 : 1));
  const reserveItems: ReserveItem[] = reserveAll.slice(0, MAX_RESERVE_ITEMS).map((s) => ({
    key: s.key, day: weekdayPlural(s.dayOfWeek, loc), time: s.time, field: s.fieldName, size: s.gameSize,
    level: s.reserve!.level, players: s.reserve!.playersAtLoss, usual: s.reserve!.baseline,
  }));

  const rows: RecentRow[] = data.recent.map((g) => {
    const cancelled = g.status === "CANCELLED";
    const field = cancelled && g.category === "FACILITY_UNAVAILABLE";
    return {
      date: g.date, time: g.time, dayKey: g.dayOfWeek, dayLabel: weekdayAbbr(g.dayOfWeek, loc),
      dateLabel: new Date(`${g.date}T00:00:00Z`).toLocaleDateString(lc, { day: "numeric", month: "short", timeZone: "UTC" }),
      field: g.fieldName ?? "", size: g.gameSize ?? "", status: g.status,
      statusLabel: cancelled ? (g.category ? labelForCancellationCategory(g.category, loc) : t("now.recent.cancelled")) : t("now.recent.confirmed"),
      kind: !cancelled ? "confirmed" : field ? "field" : "cancelled",
      players: cancelled ? null : g.players, maxPlayers: g.maxPlayers, price: g.price,
    };
  });

  return (
    <LayerSection id="ahora" title={t("nav.now")} subtitle={t("layerSub.now")}>
      <AlertChips alerts={data.alerts} t={t} />
      <Facility360NowPanel
        periods={data.periods}
        windows={data.windows}
        refISO={data.refISO}
        scope={{ regionId: data.identity.regionId, marketId: data.identity.marketId, facilityId: data.identity.id }}
        reserve={{ items: reserveItems, total: reserveAll.length }}
      />
      <DailyBars series={data.series} t={t} lc={lc} locale={loc} />
      <div className="rounded-2xl bg-surface shadow-sm p-5">
        <h3 className="text-sm font-medium text-ink mb-3">{t("now.recent.title", { n: data.recent.length })}</h3>
        {rows.length === 0 ? <p className="text-sm text-ink-faint">{t("now.recent.empty")}</p> : <RecentGamesTable rows={rows} truncated={data.recentTruncated} />}
      </div>
      <Glossary items={[
        { term: t("now.row.demandRate"), def: t("now.gloss.demandRate") },
        { term: t("now.row.rawRate"), def: t("now.gloss.rawRate") },
        { term: t("now.row.revenue"), def: t("now.gloss.revenue") },
        { term: t("now.gloss.marketTerm"), def: t("now.gloss.market") },
        { term: t("now.gloss.compareTerm"), def: t("now.gloss.compare") },
        { term: t("now.reserve.title"), def: t("now.gloss.reserve", { rate: pct(RESERVE_MIN_RATE), floor: pct(MUST_SCHEDULE_MIN_RATE) }) },
      ]} />
    </LayerSection>
  );
}
