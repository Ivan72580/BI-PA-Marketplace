import { getLocale, getTranslations } from "next-intl/server";
import type { FacilityNow } from "../lib/db/facilityNow";
import type { Agg, MarketAgg, NowPeriod, SeriesDay, NowAlert } from "../lib/facilityNowCalc";
import { labelForCancellationCategory } from "../lib/db/shared";
import { weekdayAbbr } from "../lib/db/weekday";
import type { Locale } from "@/i18n/config";
import GroupSection from "./GroupSection";
import ChangeBadge from "./ChangeBadge";

// Capa 1 del análisis de facility: "Ahora". Día, semana y mes lado a lado con variación contra el período
// anterior; cancha no disponible destacada aparte (es fricción directa contra los confirmados); evolución de
// los últimos 28 días; alertas y partidos recientes. Definiciones: app/lib/metrics.ts y facilityNowCalc.ts.

type T = (key: string, values?: Record<string, string | number>) => string;
const PERIODS: NowPeriod[] = ["day", "week", "month"];

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(0)}%`);
const pct1 = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
const usd = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const usd2 = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }));
const num = (n: number) => n.toLocaleString("en-US");
/** Variación relativa (conteos, plata); null si no hay base. */
const rel = (cur: number | null, prior: number | null) => (cur !== null && prior !== null && prior > 0 ? cur / prior - 1 : null);
/** Diferencia de puntos entre dos tasas; null si falta alguna. */
const pts = (cur: number | null, prior: number | null) => (cur !== null && prior !== null ? cur - prior : null);

type Row = {
  key: string;
  label: string;
  value: (a: Agg) => string;
  delta: (cur: Agg, prior: Agg) => number | null;
  unit: "pct" | "pts";
  invert?: boolean;
  strong?: boolean;
  market?: (cur: Agg, m: MarketAgg | undefined) => string | null;
};

function rangeLabel(p: NowPeriod, windows: FacilityNow["windows"], lc: string): string {
  const f = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lc, { ...o, timeZone: "UTC" });
  const { from, to } = windows[p].cur;
  if (p === "day") return f(to, { weekday: "short", day: "numeric", month: "short" });
  return `${f(from, { day: "numeric", month: "short" })} – ${f(to, { day: "numeric", month: "short" })}`;
}

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

// Cancha no disponible: destacada porque es la fricción que más directo pega en los confirmados.
function FieldFriction({ data, t, lc }: { data: FacilityNow; t: T; lc: string }) {
  return (
    <div className="rounded-2xl bg-warning-soft ring-1 ring-warning-fill/40 p-5">
      <div className="flex items-start gap-2">
        <span className="text-warning text-lg leading-none" aria-hidden="true">⚠</span>
        <div>
          <h3 className="text-sm font-semibold text-ink">{t("now.field.title")}</h3>
          <p className="text-xs text-ink-muted mt-0.5 max-w-3xl">{t("now.field.subtitle")}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        {PERIODS.map((p) => {
          const { cur, prior, market } = data.periods[p];
          const gap = pts(cur.fieldShare, market?.cur.fieldShare ?? null);
          return (
            <div key={p} className="rounded-xl bg-surface/70 p-3 min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">{t(`now.period.${p}`)} · {rangeLabel(p, data.windows, lc)}</div>
              <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                <span className={`font-display text-2xl font-bold ${cur.fieldUnavailable > 0 ? "text-warning" : "text-ink"}`}>{num(cur.fieldUnavailable)}</span>
                <span className="text-xs text-ink-muted">{t("now.field.ofPublished", { pct: pct1(cur.fieldShare), n: num(cur.published) })}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs flex-wrap">
                <ChangeBadge value={rel(cur.fieldUnavailable, prior.fieldUnavailable)} invert />
                {market && market.cur.fieldShare !== null && (
                  <span className="text-ink-faint">
                    {t("now.field.market", { pct: pct1(market.cur.fieldShare) })}
                    {gap !== null && Math.abs(gap) >= 0.005 && <span className={gap > 0 ? "text-danger" : "text-brand"}> ({gap > 0 ? "+" : ""}{(gap * 100).toFixed(1)} {t("now.field.pp")})</span>}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Compare({ data, t, lc }: { data: FacilityNow; t: T; lc: string }) {
  const rows: Row[] = [
    {
      key: "demandRate", label: t("now.row.demandRate"), strong: true, unit: "pts",
      value: (a) => pct(a.demandRate), delta: (c, p) => pts(c.demandRate, p.demandRate),
      market: (c, m) => (m && m.demandRate !== null && c.demandRate !== null ? `${t("now.field.market", { pct: pct(m.demandRate) })} (${c.demandRate - m.demandRate >= 0 ? "+" : ""}${((c.demandRate - m.demandRate) * 100).toFixed(0)} ${t("now.field.pp")})` : null),
    },
    { key: "published", label: t("now.row.published"), unit: "pct", value: (a) => num(a.published), delta: (c, p) => rel(c.published, p.published) },
    { key: "confirmed", label: t("now.row.confirmed"), unit: "pct", value: (a) => num(a.confirmed), delta: (c, p) => rel(c.confirmed, p.confirmed) },
    { key: "cancelled", label: t("now.row.cancelled"), unit: "pct", invert: true, value: (a) => num(a.cancelled), delta: (c, p) => rel(c.cancelled, p.cancelled) },
    { key: "fill", label: t("now.row.fill"), unit: "pts", value: (a) => pct(a.fillRate), delta: (c, p) => pts(c.fillRate, p.fillRate) },
    { key: "rawRate", label: t("now.row.rawRate"), unit: "pts", value: (a) => pct(a.rawRate), delta: (c, p) => pts(c.rawRate, p.rawRate) },
    { key: "avgPrice", label: t("now.row.avgPrice"), unit: "pct", value: (a) => usd2(a.avgPrice), delta: (c, p) => rel(c.avgPrice, p.avgPrice) },
    { key: "revenue", label: t("now.row.revenue"), unit: "pct", value: (a) => usd(a.revenue), delta: (c, p) => rel(c.revenue, p.revenue) },
    { key: "waitlist", label: t("now.row.waitlist"), unit: "pct", value: (a) => num(a.waitlist), delta: (c, p) => rel(c.waitlist, p.waitlist) },
    { key: "dropped", label: t("now.row.dropped"), unit: "pct", invert: true, value: (a) => num(a.dropped), delta: (c, p) => rel(c.dropped, p.dropped) },
  ];
  return (
    <div className="rounded-2xl bg-surface shadow-sm p-5 overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-left">
            <th className="font-normal pb-3 pr-3" />
            {PERIODS.map((p) => (
              <th key={p} className="font-normal pb-3 px-3 align-bottom">
                <div className="text-xs uppercase tracking-wide text-ink-faint">{t(`now.period.${p}`)}</div>
                <div className="text-xs text-ink-muted">{rangeLabel(p, data.windows, lc)}</div>
                <div className="text-[11px] text-ink-faint">{t(`now.vs.${p}`)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-surface-sunken align-top">
              <td className={`py-2.5 pr-3 ${r.strong ? "font-semibold text-ink" : "text-ink-muted"}`}>{r.label}</td>
              {PERIODS.map((p) => {
                const { cur, prior, market } = data.periods[p];
                const small = p === "day" && r.key === "demandRate" && cur.demandBase > 0 && cur.demandBase < 5;
                return (
                  <td key={p} className="py-2.5 px-3">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`${r.strong ? "font-display text-xl font-bold" : "font-semibold"} text-ink`}>{r.value(cur)}</span>
                      <ChangeBadge value={r.delta(cur, prior)} unit={r.unit} invert={r.invert} />
                    </div>
                    {r.market && <div className="text-[11px] text-ink-faint mt-0.5">{r.market(cur, market?.cur)}</div>}
                    {small && <div className="text-[11px] text-warning mt-0.5">{t("now.lowSample", { n: cur.demandBase })}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-ink-faint mt-3 max-w-3xl">{t("now.definitions")}</p>
    </div>
  );
}

function DailyBars({ series, t, lc }: { series: SeriesDay[]; t: T; lc: string }) {
  const H = 130;
  const max = Math.max(1, ...series.map((d) => d.confirmed + d.demandCancelled + d.fieldUnavailable + d.other));
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lc, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const seg = (n: number) => (n / max) * H;
  return (
    <div className="rounded-2xl bg-surface shadow-sm p-5">
      <h3 className="text-sm font-medium text-ink">{t("now.chart.title", { n: series.length })}</h3>
      <div className="flex items-end gap-1 mt-4" style={{ height: H }}>
        {series.map((d) => {
          const total = d.confirmed + d.demandCancelled + d.fieldUnavailable + d.other;
          const base = d.confirmed + d.demandCancelled;
          const title = `${fmt(d.date)} · ${t("now.chart.tip", { c: d.confirmed, dm: d.demandCancelled, f: d.fieldUnavailable, o: d.other, rate: base > 0 ? pct(d.confirmed / base) : "—" })}`;
          return (
            <div key={d.date} className="flex-1 flex flex-col-reverse items-stretch justify-start min-w-0" style={{ height: H }} title={title}>
              {total === 0 ? <div className="h-0.5 rounded bg-surface-sunken" /> : (
                <>
                  <div className="bg-brand" style={{ height: seg(d.confirmed) }} />
                  <div className="bg-danger" style={{ height: seg(d.demandCancelled) }} />
                  <div className="bg-warning-fill" style={{ height: seg(d.fieldUnavailable) }} />
                  <div className="bg-ink-faint/50 rounded-t-sm" style={{ height: seg(d.other) }} />
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-ink-faint mt-1.5">
        <span>{fmt(series[0].date)}</span>
        <span>{fmt(series[series.length - 1].date)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-brand" aria-hidden="true" />{t("now.chart.confirmed")}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-danger" aria-hidden="true" />{t("now.chart.demand")}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-warning-fill" aria-hidden="true" />{t("now.chart.field")}</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-ink-faint/50" aria-hidden="true" />{t("now.chart.other")}</span>
      </div>
    </div>
  );
}

function RecentGames({ data, t, locale }: { data: FacilityNow; t: T; locale: Locale }) {
  const lc = locale === "en" ? "en-US" : "es-AR";
  return (
    <details className="rounded-2xl bg-surface shadow-sm p-5 group">
      <summary className="cursor-pointer text-sm font-medium text-ink list-none flex items-center justify-between">
        <span>{t("now.recent.title", { n: data.recent.length })}</span>
        <span className="text-xs text-ink-faint group-open:hidden">{t("now.recent.show")}</span>
        <span className="text-xs text-ink-faint hidden group-open:inline">{t("now.recent.hide")}</span>
      </summary>
      {data.recent.length === 0 ? (
        <p className="text-sm text-ink-faint mt-3">{t("now.recent.empty")}</p>
      ) : (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="text-[10px] uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="text-left py-1.5 pr-2 font-medium">{t("now.recent.date")}</th>
                <th className="text-left py-1.5 px-2 font-medium">{t("now.recent.field")}</th>
                <th className="text-left py-1.5 px-2 font-medium">{t("now.recent.format")}</th>
                <th className="text-left py-1.5 px-2 font-medium">{t("now.recent.status")}</th>
                <th className="text-right py-1.5 px-2 font-medium">{t("now.recent.players")}</th>
                <th className="text-right py-1.5 pl-2 font-medium">{t("now.recent.price")}</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((g, i) => {
                const cancelled = g.status === "CANCELLED";
                const field = cancelled && g.category === "FACILITY_UNAVAILABLE";
                return (
                  <tr key={`${g.date}-${g.time}-${g.fieldName}-${i}`} className="border-t border-surface-sunken">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-ink">
                      {weekdayAbbr(g.dayOfWeek, locale)} {new Date(`${g.date}T00:00:00Z`).toLocaleDateString(lc, { day: "numeric", month: "short", timeZone: "UTC" })} · {g.time}
                    </td>
                    <td className="py-1.5 px-2 text-ink-muted">{g.fieldName ?? "—"}</td>
                    <td className="py-1.5 px-2 text-ink-muted">{g.gameSize ?? "—"}</td>
                    <td className="py-1.5 px-2">
                      {cancelled ? (
                        <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${field ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger"}`}>
                          {g.category ? labelForCancellationCategory(g.category, locale) : t("now.recent.cancelled")}
                        </span>
                      ) : (
                        <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-brand-soft text-brand">{t("now.recent.confirmed")}</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right text-ink-muted">{cancelled ? "—" : `${g.players}/${g.maxPlayers}`}</td>
                    <td className="py-1.5 pl-2 text-right text-ink-muted">{usd2(g.price)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data.recentTruncated && <p className="text-[11px] text-ink-faint mt-2">{t("now.recent.truncated")}</p>}
    </details>
  );
}

export default async function Facility360Now({ data }: { data: FacilityNow }) {
  const [tr, locale] = await Promise.all([getTranslations("Facility360"), getLocale()]);
  const t = tr as unknown as T;
  const lc = locale === "en" ? "en-US" : "es-AR";
  return (
    <div id="ahora" className="scroll-mt-32">
      <GroupSection title={t("nav.now")}>
        <AlertChips alerts={data.alerts} t={t} />
        <FieldFriction data={data} t={t} lc={lc} />
        <Compare data={data} t={t} lc={lc} />
        <DailyBars series={data.series} t={t} lc={lc} />
        <RecentGames data={data} t={t} locale={locale as Locale} />
      </GroupSection>
    </div>
  );
}
