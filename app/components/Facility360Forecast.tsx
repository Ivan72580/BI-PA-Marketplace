import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  getNetworkForecast,
  getFacilityPlan,
  getSeasonPlan,
  MIN_BLOCKS_FOR_PREDICTION,
  type ForecastRange,
  type SeasonPlanData,
} from "../lib/db/queries";
import { levelOf } from "../lib/seasonPlanCalc";
import { addDaysISO, PLAN_FILTERS, type PlanFilter } from "../lib/slotPlanCalc";
import { todayISO } from "../lib/period";
import type { Locale } from "@/i18n/config";
import LayerSection from "./LayerSection";
import FacilityWeekPlan from "./FacilityWeekPlan";
import FacilityMonthPlan, { type SeasonContext } from "./FacilityMonthPlan";
import { ReservePlan } from "./SeasonPlan";

// Capa 2 del análisis de facility: Pronóstico. Reúne lo que en Pronóstico/Estacionalidad se ve en varias
// pantallas: proyección de la ventana (7 o 30 días), semáforo por slot con "Asegurar cancha" (semana),
// plan del mes y plan de reservas a 3 meses. Es una estimación, no un dato: va marcada en ámbar.

type T = (key: string, values?: Record<string, string | number>) => string;
export type ForecastParams = { facilityId: string; date?: string; fc?: string; pf?: string };

const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const num = (n: number) => Math.round(n).toLocaleString("en-US");

function buildSeasonContext(plan: SeasonPlanData | null, today: string): SeasonContext | null {
  if (!plan) return null;
  const months = [...new Set([0, 29].map((n) => new Date(`${addDaysISO(today, n)}T00:00:00Z`).getUTCMonth()))];
  return {
    provisional: plan.method === "provisional",
    completeMonths: plan.completeMonths,
    hasIndex: plan.method !== null,
    items: months.map((month) => {
      const idx = plan.index.find((i) => i.month === month)?.index ?? null;
      const av = plan.availability.find((a) => a.month === month);
      return { month, index: idx, level: idx !== null ? levelOf(idx) : null, unavailRate: av?.rate ?? null, unavailTrendPp: av?.trendPp ?? null };
    }),
  };
}

function Tile({ label, value, low, high, t, note }: { label: string; value: string; low?: string; high?: string; t: T; note?: string }) {
  return (
    <div className="rounded-xl bg-surface-sunken p-3">
      <div className="text-xs text-ink-faint mb-1">{label}</div>
      <div className="font-display text-lg font-bold text-ink">{value}</div>
      {low !== undefined && high !== undefined && (
        <div className="mt-1.5 space-y-0.5 text-[11px] leading-tight">
          <div className="flex items-baseline gap-1 text-danger" title={t("bands.lowHint")}>
            <span aria-hidden="true">▼</span><span className="font-semibold tabular-nums">{low}</span><span className="text-ink-muted">{t("bands.low")}</span>
          </div>
          <div className="flex items-baseline gap-1 text-brand" title={t("bands.highHint")}>
            <span aria-hidden="true">▲</span><span className="font-semibold tabular-nums">{high}</span><span className="text-ink-muted">{t("bands.high")}</span>
          </div>
        </div>
      )}
      {note && <div className="text-[10px] text-warning mt-1.5 leading-snug">{note}</div>}
    </div>
  );
}

export default async function Facility360Forecast({ p }: { p: ForecastParams }) {
  const [t, t360, localeRaw] = await Promise.all([getTranslations("Forecast"), getTranslations("Facility360.forecast"), getLocale()]);
  const locale = localeRaw as Locale;
  const range: ForecastRange = p.fc === "month" ? "month" : "week";
  const today = todayISO();
  const planFilter = PLAN_FILTERS.find((f) => f === p.pf);
  const filters = { facilityId: p.facilityId };

  const [forecast, plan, seasonRaw] = await Promise.all([
    getNetworkForecast(filters, range, today),
    getFacilityPlan(p.facilityId),
    getSeasonPlan(filters),
  ]);
  const season = buildSeasonContext(range === "month" ? seasonRaw : null, today);

  // Los links de esta capa se quedan en la misma página y vuelven a su ancla.
  const href = (over: { fc?: string; pf?: string }) => {
    const q = new URLSearchParams({ facilityId: p.facilityId });
    if (p.date) q.set("date", p.date);
    if (over.fc) q.set("fc", over.fc);
    if (over.pf) q.set("pf", over.pf);
    return `/facility?${q.toString()}#pronostico`;
  };
  const weekHrefFor = (f: PlanFilter | undefined) => href({ pf: f });

  const tr = t as unknown as T;
  const f = forecast;
  return (
    <LayerSection id="pronostico" tone="warning" title={t360("title")} subtitle={t360("layerSub")} badge={t("badge")}>
      <div className="space-y-5">
        <div className="inline-flex gap-0.5 rounded-full bg-surface-panel p-1 self-start">
          {(["week", "month"] as const).map((r) => (
            <Link
              key={r}
              href={href({ fc: r === "month" ? "month" : undefined })}
              scroll={false}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${range === r ? "bg-surface text-ink font-semibold shadow-sm" : "text-ink-muted font-medium hover:text-ink"}`}
            >
              {t(r === "week" ? "rangeWeek" : "rangeMonth")}
            </Link>
          ))}
        </div>
        <p className="text-xs text-ink-muted max-w-3xl">{t("windowLabel", { n: f.windowDays })} · {t360("disclaimer")}</p>

        {f.method === "insufficient" ? (
          <div className="text-sm text-ink-faint">{t("methodInsufficient", { min: MIN_BLOCKS_FOR_PREDICTION, n: f.occurrences })}</div>
        ) : (
          <>
            {f.method === "average" && <div className="text-xs text-ink-faint">{t("methodAverage", { n: f.occurrences })}</div>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Tile t={tr} label={t("games.label")} value={f.games.predicted !== null ? num(f.games.predicted) : "—"} low={f.games.low !== null ? num(f.games.low) : undefined} high={f.games.high !== null ? num(f.games.high) : undefined} />
              <Tile t={tr} label={t("confirmation.label")} value={f.confirmationRate.predicted !== null ? pct1(f.confirmationRate.predicted) : "—"} low={f.confirmationRate.low !== null ? pct1(f.confirmationRate.low) : undefined} high={f.confirmationRate.high !== null ? pct1(f.confirmationRate.high) : undefined} />
              <Tile t={tr} label={t("occupancy.label")} value={f.occupancyRate.predicted !== null ? pct1(f.occupancyRate.predicted) : "—"} low={f.occupancyRate.low !== null ? pct1(f.occupancyRate.low) : undefined} high={f.occupancyRate.high !== null ? pct1(f.occupancyRate.high) : undefined} />
              <Tile t={tr} label={t("revenue.label")} value={f.revenue.predicted !== null ? usd(f.revenue.predicted) : "—"} low={f.revenue.low !== null ? usd(f.revenue.low) : undefined} high={f.revenue.high !== null ? usd(f.revenue.high) : undefined} note={t("revenue.lowConfidence")} />
            </div>
            {f.sameWindowLastYear && (
              <div className="text-xs text-ink-faint">{t("yoy.value", { games: num(f.sameWindowLastYear.totalGames), pct: pct1(f.sameWindowLastYear.confirmationRate) })}</div>
            )}
          </>
        )}
      </div>

      <div className="space-y-5">
        {plan ? (
          range === "week" ? (
            <FacilityWeekPlan plan={plan} t={tr} locale={locale} filter={planFilter} hrefFor={weekHrefFor} />
          ) : (
            <FacilityMonthPlan plan={plan} season={season} t={tr} locale={locale} weekHrefFor={weekHrefFor} />
          )
        ) : (
          <div className="rounded-2xl bg-surface shadow-sm p-5 text-sm text-ink-faint">{t("plan.noData")}</div>
        )}
        <ReservePlan data={seasonRaw} badge={t("reservePlanBadge")} />
      </div>
    </LayerSection>
  );
}
