import { getTranslations, getLocale } from "next-intl/server";
import { getNetworkPulse, getDailyRiskFacilities, type NetworkDayPoint } from "../lib/db/queries";
import { todayISO } from "../lib/period";
import { MUST_SCHEDULE_MIN_RATE } from "../lib/mustSchedule";
import StatStrip, { type Stat } from "./StatStrip";
import ChangeBadge from "./ChangeBadge";
import DailyRiskFacilities from "./DailyRiskFacilities";

// Landing de /daily (sin facility elegida): en vez de una pantalla vacía que pide filtros, muestra el pulso de
// la red en el último día con datos — indicadores, los últimos 14 días día por día y las facilities que
// conviene abrir primero (cada una lleva directo a su seguimiento).

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

function PulseBars({ days, locale, floorLabel }: { days: NetworkDayPoint[]; locale: string; floorLabel: string }) {
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const H = 120;
  return (
    <div>
      <div className="relative flex items-end gap-1.5" style={{ height: H }}>
        <div className="absolute inset-x-0 border-t border-dashed border-ink-faint/50" style={{ bottom: `${MUST_SCHEDULE_MIN_RATE * 100}%` }} aria-hidden="true">
          <span className="absolute right-0 -top-4 text-[10px] text-ink-faint">{floorLabel}</span>
        </div>
        {days.map((d, i) => {
          const isLast = i === days.length - 1;
          const title = d.demandRate === null ? `${fmt(d.dateISO)} · —` : `${fmt(d.dateISO)} · ${pct(d.demandRate)} · ${d.confirmed} / ${d.cancelled}`;
          return (
            <div key={d.dateISO} className="flex-1 h-full flex items-end" title={title}>
              {d.demandRate === null ? (
                <div className="w-full h-0.5 rounded bg-surface-sunken" />
              ) : (
                <div
                  className={`w-full rounded-t-md ${d.demandRate > MUST_SCHEDULE_MIN_RATE ? "bg-brand-fill" : "bg-danger-fill"} ${isLast ? "" : "opacity-60"}`}
                  style={{ height: `${Math.max(3, d.demandRate * 100)}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-ink-faint mt-1.5">
        <span>{fmt(days[0].dateISO)}</span>
        <span>{fmt(days[days.length - 1].dateISO)}</span>
      </div>
    </div>
  );
}

export default async function DailyNetworkPulse({
  facilities,
  markets,
}: {
  facilities: { id: string; name: string; marketId: string }[];
  markets: { id: string; name: string; regionId: string }[];
}) {
  const [t, locale] = await Promise.all([getTranslations("Daily.pulse"), getLocale()]);
  const [pulse, risk] = await Promise.all([getNetworkPulse(todayISO()), getDailyRiskFacilities(todayISO())]);
  const withData = pulse.days.filter((d) => d.confirmed + d.cancelled > 0);
  const last = pulse.days[pulse.days.length - 1];
  if (!pulse.lastDataISO || !last || withData.length === 0) return <DailyRiskFacilities facilities={facilities} markets={markets} />;

  // Tasa del último día contra la del resto de la ventana (agregada, no promedio de promedios).
  const prior = pulse.days.slice(0, -1);
  const priorBase = prior.reduce((s, d) => s + d.confirmed + d.demandCancelled, 0);
  const priorRate = priorBase > 0 ? prior.reduce((s, d) => s + d.confirmed, 0) / priorBase : null;
  const delta = last.demandRate !== null && priorRate !== null ? last.demandRate - priorRate : null;
  const field14 = pulse.days.reduce((s, d) => s + d.fieldUnavailable, 0);
  const high = risk.filter((r) => r.severity === "high").length;
  const lastLabel = new Date(`${pulse.lastDataISO}T00:00:00Z`).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  const stats: Stat[] = [
    { label: t("confirmed"), value: last.confirmed.toLocaleString("en-US"), sub: t("cancelledSub", { n: last.cancelled.toLocaleString("en-US") }) },
    { label: t("rate"), value: last.demandRate !== null ? pct(last.demandRate) : "—", tone: last.demandRate !== null && last.demandRate <= MUST_SCHEDULE_MIN_RATE ? "bad" : "default", sub: <ChangeBadge value={delta} unit="pts" /> },
    { label: t("field"), value: last.fieldUnavailable, tone: last.fieldUnavailable > 0 ? "warn" : "default", sub: t("fieldSub", { n: field14 }) },
    { label: t("review"), value: risk.length, tone: high > 0 ? "bad" : "default", sub: t("reviewSub", { n: high }) },
  ];

  return (
    <div className="space-y-4">
      <div className="text-xs text-ink-muted">{t("asOf", { date: lastLabel })}</div>
      <StatStrip stats={stats} />
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 items-start">
        <div className="rounded-2xl bg-surface shadow-sm p-5">
          <h3 className="text-sm font-medium text-ink mb-4">{t("chartTitle", { n: pulse.days.length })}</h3>
          <PulseBars days={pulse.days} locale={locale} floorLabel={t("floor", { pct: Math.round(MUST_SCHEDULE_MIN_RATE * 100) })} />
          <p className="text-[11px] text-ink-faint mt-3">{t("chartNote")}</p>
        </div>
        <DailyRiskFacilities facilities={facilities} markets={markets} />
      </div>
    </div>
  );
}
