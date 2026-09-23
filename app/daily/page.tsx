import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  getFilterOptions,
  getDaySnapshot,
  getDayBaseline,
  getDayEvolution,
  getWeekStrip,
  getRecentDailyTrend,
  getMustScheduleSlots,
  getDayOfWeekPattern,
  type DaySummary,
  type DayBaseline,
  type DayEvolutionPoint,
  type PatternRow,
  type TopSlotSummary,
  type StrugglingSlot,
  type TopCancelSlotSummary,
  type StrugglingCancelSlot,
} from "../lib/db/queries";
import { weekdaySingular, weekdayPlural } from "../lib/db/weekday";
import { todayISO } from "../lib/period";
import type { Locale } from "@/i18n/config";
import FacilitySearch from "../components/FacilitySearch";
import DailyRiskFacilities from "../components/DailyRiskFacilities";
import DailyBreadcrumb from "../components/DailyBreadcrumb";
import GroupSection from "../components/GroupSection";
import ChangeBadge from "../components/ChangeBadge";
import Glossary from "../components/Glossary";
import DatePicker from "../components/DatePicker";
import Sparkline from "../components/Sparkline";
import EvolutionChart from "../components/charts/EvolutionChart";
import MustScheduleBoard from "../components/MustScheduleBoard";
import type { MustScheduleCalendarCell } from "../components/MustScheduleCalendar";

type SP = { regionId?: string; marketId?: string; facilityId?: string; date?: string };

// Tipo mínimo del traductor que necesitan las funciones de esta página — el
// mismo que devuelve getTranslations("Daily").
type Translator = (key: string, values?: Record<string, string | number>) => string;

function buildDailyQuery(current: SP, overrides: Partial<SP>): string {
  const merged: SP = { ...current, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/daily?${qs}` : "/daily";
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatUSD2(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function isValidDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
      <div className="flex items-center justify-between mb-0.5">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        {action}
      </div>
      {subtitle && <p className="text-xs text-ink-faint mb-4">{subtitle}</p>}
      {!subtitle && action === undefined && <div className="mb-2" />}
      {children}
    </div>
  );
}

const MIN_SAMPLE_FOR_DAY_SUMMARY = 3;

type DayOfWeekSummary = { key: string; dayLabel: string; totalGames: number; lines: string[] };

// No es un gráfico — es un resumen en texto de lo más destacable de cada día
// de la semana, cruzando el mismo `dayOfWeekPattern` con los slots que ya
// identificamos en "Confirmación altísima" y "A vigilar" (mismo día), para
// no repetir en barras algo que ya se ve de otra forma en el resto de la
// página, sino sintetizarlo.
function buildDayOfWeekSummaries(pattern: PatternRow[], topSlots: TopSlotSummary[], strugglingSlots: StrugglingSlot[], t: Translator): DayOfWeekSummary[] {
  const withData = pattern.filter((r) => r.totalGames >= MIN_SAMPLE_FOR_DAY_SUMMARY);
  if (withData.length === 0) return [];

  const totalGamesAll = withData.reduce((s, r) => s + r.totalGames, 0);
  const avgRate = totalGamesAll > 0 ? withData.reduce((s, r) => s + r.confirmationRate * r.totalGames, 0) / totalGamesAll : 0;
  const best = withData.reduce((a, b) => (b.confirmationRate > a.confirmationRate ? b : a), withData[0]);
  const worst = withData.reduce((a, b) => (b.confirmationRate < a.confirmationRate ? b : a), withData[0]);

  return withData.map((r) => {
    const lines: string[] = [];
    const pct = formatPct(r.confirmationRate);
    const n = r.totalGames.toLocaleString("en-US");

    if (best.key === worst.key) {
      lines.push(t("dayOfWeekSummary.noVariation", { pct, n }));
    } else if (r.key === best.key) {
      lines.push(t("dayOfWeekSummary.strongest", { pct, n }));
    } else if (r.key === worst.key) {
      lines.push(t("dayOfWeekSummary.weakest", { pct, n }));
    } else if (r.confirmationRate >= avgRate) {
      lines.push(t("dayOfWeekSummary.relativeAbove", { pct, n, avg: formatPct(avgRate) }));
    } else {
      lines.push(t("dayOfWeekSummary.relativeBelow", { pct, n, avg: formatPct(avgRate) }));
    }

    if (r.occupancyRate < 0.6) {
      lines.push(t("dayOfWeekSummary.lowOccupancy", { pct: formatPct(r.occupancyRate) }));
    }

    const daySlots = topSlots.filter((s) => s.day === r.key);
    if (daySlots.length > 0) {
      const bestSlot = [...daySlots].sort((a, b) => b.confirmationRate - a.confirmationRate)[0];
      lines.push(t("dayOfWeekSummary.topSlots", { n: daySlots.length, hour: bestSlot.hour, pct: formatPct(bestSlot.confirmationRate) }));
    }

    const dayStruggling = strugglingSlots.filter((s) => s.day === r.key);
    if (dayStruggling.length > 0) {
      const declining = dayStruggling.filter((s) => s.reason === "declining").length;
      const decliningSuffix = declining > 0 ? t("dayOfWeekSummary.decliningSuffix", { n: declining }) : "";
      lines.push(t("dayOfWeekSummary.watchSlots", { n: dayStruggling.length, decliningSuffix }));
    }

    return { key: r.key, dayLabel: r.label, totalGames: r.totalGames, lines };
  });
}

// Espejo de buildDayOfWeekSummaries para la vista de cancelaciones — misma
// estructura (mejor/peor día, cruce con los slots de la propia vista
// invertida), pero "mejor" acá es MENOS cancelación, y en vez del flag de
// ocupación baja se usa la conversión (jugadores que se anotan y no llegan a
// jugar) porque es el indicador que más se relaciona con déficit/abandono,
// el eje que pidió esta vista.
function buildDayOfWeekCancelSummaries(pattern: PatternRow[], topCancelSlots: TopCancelSlotSummary[], strugglingCancelSlots: StrugglingCancelSlot[], t: Translator): DayOfWeekSummary[] {
  const withData = pattern.filter((r) => r.totalGames >= MIN_SAMPLE_FOR_DAY_SUMMARY);
  if (withData.length === 0) return [];

  const totalGamesAll = withData.reduce((s, r) => s + r.totalGames, 0);
  const avgRate = totalGamesAll > 0 ? withData.reduce((s, r) => s + r.cancellationRate * r.totalGames, 0) / totalGamesAll : 0;
  const best = withData.reduce((a, b) => (b.cancellationRate < a.cancellationRate ? b : a), withData[0]);
  const worst = withData.reduce((a, b) => (b.cancellationRate > a.cancellationRate ? b : a), withData[0]);

  return withData.map((r) => {
    const lines: string[] = [];
    const pct = formatPct(r.cancellationRate);
    const n = r.totalGames.toLocaleString("en-US");

    if (best.key === worst.key) {
      lines.push(t("dayOfWeekCancelSummary.noVariation", { pct, n }));
    } else if (r.key === best.key) {
      lines.push(t("dayOfWeekCancelSummary.best", { pct, n }));
    } else if (r.key === worst.key) {
      lines.push(t("dayOfWeekCancelSummary.worst", { pct, n }));
    } else if (r.cancellationRate <= avgRate) {
      lines.push(t("dayOfWeekCancelSummary.relativeBelow", { pct, n, avg: formatPct(avgRate) }));
    } else {
      lines.push(t("dayOfWeekCancelSummary.relativeAbove", { pct, n, avg: formatPct(avgRate) }));
    }

    if (r.conversionRate < 0.85) {
      lines.push(t("dayOfWeekCancelSummary.lowConversion", { pct: formatPct(r.conversionRate) }));
    }

    const daySlots = topCancelSlots.filter((s) => s.day === r.key);
    if (daySlots.length > 0) {
      const worstSlot = [...daySlots].sort((a, b) => b.cancellationRate - a.cancellationRate)[0];
      lines.push(t("dayOfWeekCancelSummary.topSlots", { n: daySlots.length, hour: worstSlot.hour, pct: formatPct(worstSlot.cancellationRate) }));
    }

    const dayStruggling = strugglingCancelSlots.filter((s) => s.day === r.key);
    if (dayStruggling.length > 0) {
      const worsening = dayStruggling.filter((s) => s.reason === "worsening").length;
      const worseningSuffix = worsening > 0 ? t("dayOfWeekCancelSummary.worseningSuffix", { n: worsening }) : "";
      lines.push(t("dayOfWeekCancelSummary.watchSlots", { n: dayStruggling.length, worseningSuffix }));
    }

    return { key: r.key, dayLabel: r.label, totalGames: r.totalGames, lines };
  });
}

function Stat({ label, value, sublabel, delta, deltaInvert }: { label: string; value: string; sublabel?: string; delta?: number | null; deltaInvert?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
      <div className="text-xs text-ink-faint mb-1">{label}</div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="font-display text-xl font-semibold text-ink">{value}</div>
        {delta !== undefined && <ChangeBadge value={delta} invert={deltaInvert} />}
      </div>
      {sublabel && <div className="text-xs text-ink-faint mt-0.5">{sublabel}</div>}
    </div>
  );
}

// Insights de "variación diaria" + "recomendaciones" — determinísticos,
// calculados sobre datos ya obtenidos (mismo criterio que buildQuarterInsights
// en Trends), no una consulta nueva.
function buildDayInsights(summary: DaySummary, baseline: DayBaseline, evolution: DayEvolutionPoint[], t: Translator, locale: Locale): string[] {
  const lines: string[] = [];
  const weekdaySing = weekdaySingular(summary.dayOfWeek, locale);
  const weekdayPl = weekdayPlural(summary.dayOfWeek, locale);

  if (summary.totalGames === 0) {
    lines.push(t("insights.noGames", { weekday: weekdaySing }));
    return lines;
  }

  if (baseline.occurrences >= 3) {
    const deltaConfirm = summary.confirmationRate - baseline.avgConfirmationRate;
    const deltaPts = Math.abs(deltaConfirm * 100).toFixed(1);
    if (Math.abs(deltaConfirm) < 0.03) {
      lines.push(t("insights.confirmationInLine", { rate: formatPct(summary.confirmationRate), n: baseline.occurrences, weekday: weekdayPl, avg: formatPct(baseline.avgConfirmationRate) }));
    } else if (deltaConfirm > 0) {
      lines.push(t("insights.confirmationAbove", { rate: formatPct(summary.confirmationRate), pts: deltaPts, n: baseline.occurrences, weekday: weekdayPl, avg: formatPct(baseline.avgConfirmationRate) }));
    } else {
      lines.push(t("insights.confirmationBelow", { rate: formatPct(summary.confirmationRate), pts: deltaPts, n: baseline.occurrences, weekday: weekdayPl, avg: formatPct(baseline.avgConfirmationRate) }));
    }

    const deltaGames = summary.totalGames - baseline.avgGamesPerOccurrence;
    if (Math.abs(deltaGames) >= 1) {
      const n = Math.abs(Math.round(deltaGames));
      const avg = baseline.avgGamesPerOccurrence.toFixed(1);
      lines.push(deltaGames > 0 ? t("insights.gamesMore", { n, avg }) : t("insights.gamesLess", { n, avg }));
    }
  } else {
    lines.push(t("insights.noBaseline", { weekday: weekdayPl }));
  }

  const topCancel = summary.cancellationBreakdown[0];
  if (topCancel && topCancel.count >= 2) {
    lines.push(t("insights.topCancelReason", { reason: topCancel.label, count: topCancel.count, total: summary.cancelledGames }));
  }

  const withData = evolution.filter((p) => p.totalGames > 0);

  // Punto 1: análisis resumido de las últimas semanas (mínimo 6, hasta las
  // 12 que trae `evolution`) — tendencia general, no solo el día de hoy.
  if (withData.length >= 6) {
    const first = withData[0];
    const lastPoint = withData[withData.length - 1];
    const rates = withData.map((p) => p.confirmationRate);
    const maxRate = Math.max(...rates);
    const minRate = Math.min(...rates);
    const diff = lastPoint.confirmationRate - first.confirmationRate;
    const trendKey = diff >= 0.08 ? "insights.trendUp" : diff <= -0.08 ? "insights.trendDown" : "insights.trendStable";
    lines.push(
      t("insights.trendSummary", {
        n: withData.length,
        weekday: weekdayPl,
        trend: t(trendKey),
        first: formatPct(first.confirmationRate),
        last: formatPct(lastPoint.confirmationRate),
        min: formatPct(minRate),
        max: formatPct(maxRate),
      })
    );
  } else {
    lines.push(t("insights.noWeeklyHistory", { weekday: weekdayPl }));
  }

  // Punto 2: comportamiento de HOY respecto a esa tendencia reciente (no el
  // promedio plano de la línea base — acá importa si hoy siguió, aceleró o
  // rompió la dirección en la que venían las últimas ocurrencias).
  if (withData.length >= 4) {
    const today = withData[withData.length - 1];
    const recentWindow = withData.slice(0, -1).slice(-3);
    if (recentWindow.length >= 2) {
      const recentAvg = recentWindow.reduce((s, p) => s + p.confirmationRate, 0) / recentWindow.length;
      const diffFromTrend = today.confirmationRate - recentAvg;
      const diffPts = Math.abs(diffFromTrend * 100).toFixed(1);
      if (Math.abs(diffFromTrend) < 0.05) {
        lines.push(t("insights.todayInLine", { n: recentWindow.length, weekday: weekdayPl, avg: formatPct(recentAvg) }));
      } else if (diffFromTrend > 0) {
        lines.push(t("insights.todayAbove", { pts: diffPts, avg: formatPct(recentAvg), n: recentWindow.length, weekday: weekdayPl }));
      } else {
        lines.push(t("insights.todayBelow", { pts: diffPts, avg: formatPct(recentAvg), n: recentWindow.length, weekday: weekdayPl }));
      }
    }
  }

  return lines;
}

export default async function DailyPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [filterOptions, locale, t] = await Promise.all([
    getFilterOptions(),
    getLocale(),
    getTranslations("Daily"),
  ]);

  // ---------- Selección obligatoria: región, market Y facility ----------
  // A diferencia de Trends/Market (que admiten un panorama agregado), esta
  // página reporta el detalle operativo de UNA facility en UN día puntual —
  // sin facility no hay "todo lo que pasó" que mostrar.
  if (!sp.regionId || !sp.marketId || !sp.facilityId) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold text-ink mb-1">{t("title")}</h1>
        <div className="text-sm text-ink-faint mb-4 max-w-2xl">{t("subtitle")}</div>

        <div className="rounded-2xl bg-brand-soft/50 border border-brand/25 px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">{t("selectPromptTitle")}</div>
            <div className="text-xs text-ink-muted">{t("selectPromptSubtitle")}</div>
          </div>
          <div className="w-full sm:w-80 shrink-0">
            <FacilitySearch
              facilities={filterOptions.facilities}
              markets={filterOptions.markets}
              variant="panel"
              autoFocus
              placeholder={t("facilitySearch.placeholder")}
              // FacilitySearch es un Client Component: no puede recibir un
              // callback armado acá (Server Component) — por eso se le pasa
              // el mensaje ya traducido con el literal "{query}" (lo
              // reemplaza él mismo al mostrar el resultado) en vez de una
              // función. Ver el comentario en FacilitySearch.tsx.
              emptyMessageTemplate={t("facilitySearch.empty", { query: "{query}" })}
              basePath="/daily"
              extraParams={{ date: sp.date }}
            />
          </div>
        </div>

        <div className="mt-5 max-w-xl">
          <DailyRiskFacilities facilities={filterOptions.facilities} markets={filterOptions.markets} />
        </div>
      </div>
    );
  }

  const dateISO = isValidDate(sp.date) ? sp.date : todayISO();

  const [summary, baseline, evolution, weekStrip, recentTrend, mustSchedule, dayOfWeekPattern] = await Promise.all([
    getDaySnapshot(sp.facilityId, dateISO, locale as Locale),
    getDayBaseline(sp.facilityId, dateISO),
    getDayEvolution(sp.facilityId, dateISO, locale as Locale),
    getWeekStrip(sp.facilityId, dateISO, locale as Locale),
    getRecentDailyTrend(sp.facilityId, dateISO),
    getMustScheduleSlots(sp.facilityId, dateISO, locale as Locale),
    // getDayOfWeekPattern ahora es compartida con /trends y pide `locale`
    // explícito (ver app/lib/db/trends.ts) — /daily nunca usa su campo
    // `.label` (solo `.key`/`.totalGames`/`.confirmationRate`/
    // `.cancellationRate`), así que esto no traduce nada nuevo acá, solo
    // satisface la firma.
    getDayOfWeekPattern({ facilityId: sp.facilityId }, locale as Locale),
  ]);

  const sparklinePoints = recentTrend.map((p) => Math.round(p.confirmationRate * 1000) / 10);

  // Todo el historial disponible de esta facility, sin filtrar por el día
  // elegido arriba — responde "¿qué día de la semana funciona mejor acá en
  // general?", no "¿qué tan bien le fue a este día puntual?".
  const dayOfWeekSummaries = buildDayOfWeekSummaries(dayOfWeekPattern, mustSchedule.topSlots, mustSchedule.strugglingSlots, t);
  const dayOfWeekCancelSummaries = buildDayOfWeekCancelSummaries(dayOfWeekPattern, mustSchedule.topCancelSlots, mustSchedule.strugglingCancelSlots, t);

  // Mismas celdas de mustSchedule.cells / cancelCells, normalizadas a la
  // forma genérica que espera MustScheduleCalendar (rate/matchingGames en
  // vez de confirmationRate/confirmedGames o cancellationRate/cancelledGames).
  const confirmedCalendarCells: MustScheduleCalendarCell[] = mustSchedule.cells.map((c) => ({
    day: c.day, dayLabel: c.dayLabel, hour: c.hour, formatLabel: c.formatLabel,
    rate: c.confirmationRate, totalGames: c.totalGames, matchingGames: c.confirmedGames,
    trend: c.trend, insight: c.insight,
  }));
  const cancelledCalendarCells: MustScheduleCalendarCell[] = mustSchedule.cancelCells.map((c) => ({
    day: c.day, dayLabel: c.dayLabel, hour: c.hour, formatLabel: c.formatLabel,
    rate: c.cancellationRate, totalGames: c.totalGames, matchingGames: c.cancelledGames,
    trend: c.trend, insight: c.insight,
  }));

  const insights = buildDayInsights(summary, baseline, evolution, t, locale as Locale);

  const evolutionChartData = {
    labels: evolution.map((p) => p.label),
    datasets: [
      {
        label: t("evolution.legendLabel"),
        data: evolution.map((p) => Math.round(p.confirmationRate * 1000) / 10),
        borderColor: "#16755c",
      },
    ],
  };

  // Contenido de las 3 lecturas adicionales sobre "Slots que sí o sí" — en
  // pestañas (mismo componente Tabs que Market) en vez de apiladas, para que
  // convivan al lado del calendario sin extender la página hacia abajo.
  const dayOfWeekTabContent = (
    <div>
      <p className="text-[13px] text-ink-faint mb-4">{t("mustSchedule.dayOfWeekIntro")}</p>
      {dayOfWeekSummaries.length > 0 ? (
        <div className="space-y-4">
          {dayOfWeekSummaries.map((d) => (
            <div key={d.key} className="pb-4 border-b border-surface-sunken last:border-0 last:pb-0">
              <div className="text-base font-semibold text-ink mb-1.5">{d.dayLabel}</div>
              <ul className="space-y-1.5">
                {d.lines.map((line, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-ink-muted leading-snug">
                    <span className="text-brand shrink-0">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-ink-faint">{t("mustSchedule.dayOfWeekEmpty")}</div>
      )}
    </div>
  );

  const topSlotsTabContent = (
    <div>
      <p className="text-[13px] text-ink-faint mb-4">{t("mustSchedule.topSlotsIntro")}</p>
      {mustSchedule.topSlots.length > 0 ? (
        <ul className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
          {mustSchedule.topSlots.map((s, i) => (
            <li key={i} className="border-b border-surface-sunken last:border-0 pb-4 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] text-ink font-semibold">{s.dayLabel} {s.hour} · {s.formatLabel}</span>
                <span className="text-base text-brand font-bold shrink-0">{formatPct(s.confirmationRate)}</span>
              </div>
              <div className="text-[13px] text-ink-faint mt-1 leading-snug">
                {s.avgOccupancyRate != null ? t("mustSchedule.occupancy", { pct: formatPct(s.avgOccupancyRate) }) : t("mustSchedule.occupancyEmpty")}
                {s.avgGamePrice != null && t("mustSchedule.priceSuffix", { price: formatUSD2(s.avgGamePrice) })}
                {s.avgGamePrice != null && s.avgRevenuePerPlayer != null && t("mustSchedule.pricePerPlayerSuffix", { price: formatUSD2(s.avgRevenuePerPlayer) })}
                {s.avgRating != null && t("mustSchedule.ratingSuffix", { rating: s.avgRating.toFixed(1) })}
                {s.avgLeadTime != null && t("mustSchedule.leadTimeSuffix", { hours: s.avgLeadTime.toFixed(1) })}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-ink-faint">{t("mustSchedule.topSlotsEmpty")}</div>
      )}
    </div>
  );

  const strugglingTabContent = (
    <div>
      <p className="text-[13px] text-ink-faint mb-4">{t("mustSchedule.strugglingIntro")}</p>
      {mustSchedule.strugglingSlots.length > 0 ? (
        <ul className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
          {mustSchedule.strugglingSlots.map((s, i) => (
            <li key={i} className="border-b border-surface-sunken last:border-0 pb-4 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] text-ink font-semibold">{s.dayLabel} {s.hour} · {s.formatLabel}</span>
                <span className={`text-base shrink-0 font-bold ${s.reason === "declining" ? "text-warning" : "text-ink-faint"}`}>{formatPct(s.confirmationRate)}</span>
              </div>
              <div className="text-[13px] text-ink-faint mt-1 leading-snug">{s.insight}</div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-ink-faint">{t("mustSchedule.strugglingEmpty")}</div>
      )}
    </div>
  );

  // ---- Vista invertida (cancelaciones): mismos 3 contenidos, espejados ----
  const dayOfWeekCancelTabContent = (
    <div>
      <p className="text-[13px] text-ink-faint mb-4">{t("mustSchedule.dayOfWeekIntro")}</p>
      {dayOfWeekCancelSummaries.length > 0 ? (
        <div className="space-y-4">
          {dayOfWeekCancelSummaries.map((d) => (
            <div key={d.key} className="pb-4 border-b border-surface-sunken last:border-0 last:pb-0">
              <div className="text-base font-semibold text-ink mb-1.5">{d.dayLabel}</div>
              <ul className="space-y-1.5">
                {d.lines.map((line, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-ink-muted leading-snug">
                    <span className="text-danger shrink-0">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-ink-faint">{t("mustSchedule.dayOfWeekEmpty")}</div>
      )}
    </div>
  );

  const topCancelSlotsTabContent = (
    <div>
      <p className="text-[13px] text-ink-faint mb-4">{t("mustSchedule.topCancelIntro")}</p>
      {mustSchedule.topCancelSlots.length > 0 ? (
        <ul className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
          {mustSchedule.topCancelSlots.map((s, i) => (
            <li key={i} className="border-b border-surface-sunken last:border-0 pb-4 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] text-ink font-semibold">{s.dayLabel} {s.hour} · {s.formatLabel}</span>
                <span className="text-base text-danger font-bold shrink-0">{formatPct(s.cancellationRate)}</span>
              </div>
              <div className="text-[13px] text-ink-faint mt-1 leading-snug">
                {s.avgOccupancyAtCancel != null ? t("mustSchedule.occupancyAtCancel", { pct: formatPct(s.avgOccupancyAtCancel) }) : t("mustSchedule.occupancyAtCancelEmpty")}
                {s.avgGamePrice != null && t("mustSchedule.priceSuffix", { price: formatUSD2(s.avgGamePrice) })}
                {s.avgDeficit != null && t("mustSchedule.deficitSuffix", { n: Math.round(s.avgDeficit * 10) / 10 })}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-ink-faint">{t("mustSchedule.topCancelEmpty")}</div>
      )}
    </div>
  );

  const strugglingCancelTabContent = (
    <div>
      <p className="text-[13px] text-ink-faint mb-4">{t("mustSchedule.strugglingCancelIntro")}</p>
      {mustSchedule.strugglingCancelSlots.length > 0 ? (
        <ul className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
          {mustSchedule.strugglingCancelSlots.map((s, i) => (
            <li key={i} className="border-b border-surface-sunken last:border-0 pb-4 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] text-ink font-semibold">{s.dayLabel} {s.hour} · {s.formatLabel}</span>
                <span className={`text-base shrink-0 font-bold ${s.reason === "worsening" ? "text-danger" : "text-warning"}`}>{formatPct(s.cancellationRate)}</span>
              </div>
              <div className="text-[13px] text-ink-faint mt-1 leading-snug">{s.insight}</div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-ink-faint">{t("mustSchedule.strugglingCancelEmpty")}</div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <DailyBreadcrumb regions={filterOptions.regions} markets={filterOptions.markets} facilities={filterOptions.facilities} sp={sp} />
        <h1 className="font-display text-3xl font-bold text-ink mb-1">{t("title")}</h1>
        <div className="text-sm text-ink-faint">{summary.dayLabel} {dateISO} — {summary.facilityName}</div>
      </div>

      <div className="rounded-2xl bg-surface shadow-sm p-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-ink-faint shrink-0">{t("dayPickerLabel")}</span>
        <DatePicker value={dateISO} paramName="date" />
        <div className="flex items-center gap-1 flex-wrap">
          {weekStrip.map((d) => (
            <Link
              key={d.dateISO}
              href={buildDailyQuery(sp, { date: d.dateISO })}
              className={`flex flex-col items-center rounded-lg px-2.5 py-1.5 min-w-[52px] text-center transition-colors ${
                d.dateISO === dateISO ? "bg-brand text-white" : d.hasData ? "bg-surface-sunken hover:bg-brand-soft text-ink" : "bg-surface-sunken/50 text-ink-faint"
              }`}
            >
              <span className="text-[10px] font-medium">{d.dayLabel}</span>
              <span className="text-[10px]">{d.hasData ? formatPct(d.confirmationRate) : "—"}</span>
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-ink-faint leading-none mb-1">{t("sparklineLabel")}</span>
            <Sparkline points={sparklinePoints} />
          </div>
          <Link href={buildDailyQuery(sp, { date: undefined })} className="text-ink-faint hover:text-brand text-xs shrink-0">{t("todayLink")}</Link>
        </div>
      </div>

      {summary.totalGames === 0 ? (
        <div className="rounded-2xl bg-surface shadow-sm p-6 text-sm text-ink-faint">
          {t("noGamesToday", { facility: summary.facilityName })}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Stat label={t("stats.games")} value={String(summary.totalGames)} sublabel={t("stats.gamesSublabel", { confirmed: summary.confirmedGames, cancelled: summary.cancelledGames })} />
            <Stat label={t("stats.confirmation")} value={formatPct(summary.confirmationRate)} delta={baseline.occurrences >= 3 ? summary.confirmationRate - baseline.avgConfirmationRate : undefined} />
            <Stat label={t("stats.occupancy")} value={formatPct(summary.occupancyRate)} delta={baseline.occurrences >= 3 ? summary.occupancyRate - baseline.avgOccupancyRate : undefined} />
            <Stat label={t("stats.revenue")} value={formatUSD(summary.totalRevenue)} sublabel={summary.avgRating != null ? t("stats.avgRating", { rating: summary.avgRating.toFixed(1) }) : undefined} />
            <Stat
              label={t("stats.pricePerPlayer")}
              value={summary.avgRevenuePerPlayer != null ? formatUSD2(summary.avgRevenuePerPlayer) : "—"}
              sublabel={summary.avgGamePrice != null ? t("stats.avgTicket", { price: formatUSD2(summary.avgGamePrice) }) : undefined}
            />
          </div>

          <GroupSection title={t("variationSection")}>
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5">
              <SectionCard title={t("evolution.title", { n: evolution.length, weekday: weekdayPlural(summary.dayOfWeek, locale as Locale) })} subtitle={t("evolution.subtitle")}>
                {evolution.length > 1 ? (
                  <EvolutionChart data={evolutionChartData} />
                ) : (
                  <div className="text-sm text-ink-faint">{t("evolution.empty", { weekday: weekdayPlural(summary.dayOfWeek, locale as Locale) })}</div>
                )}
              </SectionCard>
              <SectionCard title={t("todayInsights.title")} subtitle={t("todayInsights.subtitle")}>
                <ul className="space-y-2 text-sm text-ink">
                  {insights.map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-brand shrink-0">·</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </div>
          </GroupSection>

          <GroupSection title={t("gamesDetailSection")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.games.map((g) => (
                <div key={g.id} className={`rounded-xl border p-3 ${g.status === "CONFIRMED" ? "border-brand/25 bg-brand-soft/30" : "border-danger/25 bg-danger-soft/30"}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-ink">{g.time}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${g.status === "CONFIRMED" ? "bg-brand text-white" : "bg-danger text-white"}`}>
                      {g.status === "CONFIRMED" ? t("game.confirmed") : t("game.cancelled")}
                    </span>
                  </div>
                  <div className="text-xs text-ink-muted mb-1.5">{g.formatLabel} · {g.organizer}</div>
                  <div className="text-xs text-ink-faint space-y-0.5">
                    <div>
                      {t("game.players", { final: g.finalPlayers, max: g.maxPlayers, min: g.minPlayers })}
                      {g.waitlistPlayers > 0 ? t("game.waitlist", { n: g.waitlistPlayers }) : ""}
                      {g.droppedPlayers > 0 ? t("game.dropped", { n: g.droppedPlayers }) : ""}
                    </div>
                    {g.status === "CANCELLED" && g.playersMissing != null && g.playersMissing > 0 && (
                      <div>{t("game.missing", { n: g.playersMissing })}</div>
                    )}
                    {g.cancellationReason && <div>{t("game.reason", { reason: g.cancellationReason })}</div>}
                    {g.confirmationLeadTime != null && <div>{t("game.leadTime", { hours: g.confirmationLeadTime.toFixed(1) })}</div>}
                    {g.gamePrice != null && (
                      <div>
                        {t("game.price", { price: formatUSD2(g.gamePrice) })}
                        {g.revenuePerPlayer != null ? t("game.pricePerPlayer", { price: formatUSD2(g.revenuePerPlayer) }) : ""}
                      </div>
                    )}
                    {g.eventRevenue != null && <div>{t("game.revenue", { amount: formatUSD(g.eventRevenue) })}</div>}
                    {g.averageRating != null && (
                      <div>
                        {t("game.rating", { rating: g.averageRating.toFixed(1) })}
                        {g.ratingCount != null && g.ratingCount > 0 ? ` ${t("game.ratingCount", { count: g.ratingCount })}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </GroupSection>
        </>
      )}

      <GroupSection title={t("mustSchedule.section")}>
        <p className="text-xs text-ink-faint -mt-1">{t("mustSchedule.description")}</p>
        {/* 50/50: el calendario se centra dentro de su mitad (no pegado al
            borde izquierdo) y las pestañas ocupan todo el ancho de la suya
            — reparte el espacio simétricamente respecto del centro de la
            sección en vez de dejarlo todo amontonado a la izquierda. El
            toggle Confirmados/Cancelados vive dentro del mismo recuadro
            (MustScheduleBoard) para no sumar una sección nueva más abajo. */}
        <MustScheduleBoard
          days={mustSchedule.days}
          hours={mustSchedule.hours}
          confirmedCells={confirmedCalendarCells}
          cancelledCells={cancelledCalendarCells}
          confirmedTabs={[
            { id: "dow", label: t("mustSchedule.tabDayOfWeek"), content: dayOfWeekTabContent },
            { id: "top", label: t("mustSchedule.tabTopConfirm", { n: mustSchedule.topSlots.length }), content: topSlotsTabContent },
            { id: "watch", label: t("mustSchedule.tabWatch", { n: mustSchedule.strugglingSlots.length }), content: strugglingTabContent },
          ]}
          cancelledTabs={[
            { id: "dow", label: t("mustSchedule.tabDayOfWeek"), content: dayOfWeekCancelTabContent },
            { id: "top", label: t("mustSchedule.tabTopCancel", { n: mustSchedule.topCancelSlots.length }), content: topCancelSlotsTabContent },
            { id: "watch", label: t("mustSchedule.tabWatch", { n: mustSchedule.strugglingCancelSlots.length }), content: strugglingCancelTabContent },
          ]}
        />
        <Glossary
          items={[
            { term: t("glossary.confirmationRateTerm"), def: t("glossary.confirmationRateDef") },
            { term: t("glossary.cancellationRateTerm"), def: t("glossary.cancellationRateDef") },
          ]}
        />
      </GroupSection>
    </div>
  );
}
