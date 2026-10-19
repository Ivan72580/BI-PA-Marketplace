import { getLocale, getTranslations } from "next-intl/server";
import { getFacilityDeep, getSeasonPlan } from "../lib/db/queries";
import { levelOf } from "../lib/seasonPlanCalc";
import GroupSection from "./GroupSection";
import StatStrip, { type Stat } from "./StatStrip";
import ChangeBadge from "./ChangeBadge";
import Sparkline from "./Sparkline";

// Capa 6: Tendencia y estacionalidad. Evolución mensual de los últimos 13 meses (la tendencia sale de comparar los
// últimos 3 meses completos con los 3 anteriores) y el índice estacional propio de la facility (Estacionalidad).

type T = (key: string, values?: Record<string, string | number>) => string;
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(0)}%`);
const num = (n: number) => n.toLocaleString("en-US");
const usd = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const LEVEL_BAR = { high: "bg-brand", mid: "bg-ink-faint/50", low: "bg-warning-fill" } as const;

export default async function Facility360Trend({ facilityId, date }: { facilityId: string; date?: string }) {
  const [tr, locale, deep, season] = await Promise.all([getTranslations("Facility360"), getLocale(), getFacilityDeep(facilityId, date), getSeasonPlan({ facilityId })]);
  if (!deep) return null;
  const t = tr as unknown as T;
  const lc = locale === "en" ? "en-US" : "es-AR";
  const mon = (m: string, o: Intl.DateTimeFormatOptions) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(lc, { ...o, timeZone: "UTC" });

  // Meses completos: todos menos el último (parcial). Tendencia = últimos 3 vs 3 anteriores.
  const full = deep.monthly.slice(0, -1);
  const sum = (a: typeof full, f: (x: (typeof full)[number]["agg"]) => number) => a.reduce((s, m) => s + f(m.agg), 0);
  const last3 = full.slice(-3), prev3 = full.slice(-6, -3);
  const rate = (a: typeof full) => { const c = sum(a, (x) => x.confirmed), d = sum(a, (x) => x.demandCancelled); return c + d > 0 ? c / (c + d) : null; };
  const r3 = rate(last3), p3 = rate(prev3);
  const pub3 = sum(last3, (x) => x.published), ppub3 = sum(prev3, (x) => x.published);
  const rev3 = sum(last3, (x) => x.revenue ?? 0), prev = sum(prev3, (x) => x.revenue ?? 0);
  const hasPrev = prev3.length === 3 && ppub3 > 0;

  const stats: Stat[] = [
    { label: t("trend.stat.demand"), value: pct(r3), sub: hasPrev && r3 !== null && p3 !== null ? <ChangeBadge value={r3 - p3} unit="pts" /> : t("trend.stat.noPrior") },
    { label: t("trend.stat.published"), value: num(pub3), sub: hasPrev ? <ChangeBadge value={ppub3 > 0 ? pub3 / ppub3 - 1 : null} /> : t("trend.stat.noPrior") },
    { label: t("trend.stat.revenue"), value: usd(rev3 > 0 ? rev3 : null), sub: hasPrev ? <ChangeBadge value={prev > 0 ? rev3 / prev - 1 : null} /> : t("trend.stat.noPrior") },
  ];
  const demandPoints = deep.monthly.map((m) => ({ label: mon(m.month, { month: "short", year: "2-digit" }), value: m.agg.demandRate === null ? 0 : m.agg.demandRate * 100 }));

  const nowMonth = Number(deep.refISO.slice(5, 7)) - 1;
  const idx = season?.index ?? [];
  const maxIdx = Math.max(1.4, ...idx.map((i) => i.index ?? 0));

  return (
    <div id="tendencia" className="scroll-mt-[var(--layer-offset,10rem)]">
      <GroupSection title={t("nav.trend")}>
        <p className="text-xs text-ink-muted max-w-3xl -mt-1">{t("trend.windowNote")}</p>
        <StatStrip stats={stats} />

        <div className="rounded-2xl bg-surface shadow-sm p-5">
          <h3 className="text-sm font-medium text-ink">{t("trend.monthlyTitle")}</h3>
          <div className="mt-2"><Sparkline points={demandPoints} width={420} height={56} formatValue={(v) => `${v.toFixed(0)}%`} /></div>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-ink-faint">
                  <th className="text-left py-1.5 px-2 font-medium">{t("price.month")}</th>
                  <th className="text-right py-1.5 px-2 font-medium">{t("now.row.published")}</th>
                  <th className="text-right py-1.5 px-2 font-medium">{t("now.row.demandRate")}</th>
                  <th className="text-right py-1.5 px-2 font-medium">{t("now.row.rawRate")}</th>
                  <th className="text-right py-1.5 px-2 font-medium">{t("now.field.title")}</th>
                </tr>
              </thead>
              <tbody>
                {[...deep.monthly].reverse().map((m, i) => (
                  <tr key={m.month} className="border-t border-surface-sunken">
                    <td className="py-1.5 px-2 text-ink-muted whitespace-nowrap">{mon(m.month, { month: "long", year: "numeric" })}{i === 0 && <span className="text-[10px] text-ink-faint"> · {t("price.partial")}</span>}</td>
                    <td className="py-1.5 px-2 text-right text-ink-muted tabular-nums">{num(m.agg.published)}</td>
                    <td className="py-1.5 px-2 text-right font-semibold text-ink tabular-nums">{pct(m.agg.demandRate)}</td>
                    <td className="py-1.5 px-2 text-right text-ink-muted tabular-nums">{pct(m.agg.rawRate)}</td>
                    <td className={`py-1.5 px-2 text-right tabular-nums ${m.agg.fieldUnavailable > 0 ? "text-warning font-semibold" : "text-ink-faint"}`}>{m.agg.fieldUnavailable > 0 ? `${m.agg.fieldUnavailable} · ${pct(m.agg.fieldShare)}` : "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl bg-surface shadow-sm p-5">
          <h3 className="text-sm font-medium text-ink">{t("trend.seasonTitle")}</h3>
          <p className="text-xs text-ink-muted mt-0.5 max-w-3xl">{t("trend.seasonSub")}</p>
          {!season || season.method === null ? (
            <p className="text-sm text-ink-faint mt-3">{t("trend.seasonNone", { n: season?.completeMonths ?? 0 })}</p>
          ) : (
            <>
              {season.method === "provisional" && <p className="text-xs text-warning mt-2">{t("trend.seasonProvisional", { n: season.completeMonths })}</p>}
              <ul className="mt-3 grid grid-cols-6 sm:grid-cols-12 gap-2 items-end">
                {idx.map((i) => {
                  const level = i.index !== null ? levelOf(i.index) : null;
                  const av = season.availability.find((a) => a.month === i.month);
                  const h = i.index !== null ? Math.max(6, (i.index / maxIdx) * 90) : 6;
                  return (
                    <li key={i.month} className={`flex flex-col items-center gap-1 rounded-lg p-1 ${i.month === nowMonth ? "bg-surface-sunken" : ""}`} title={t("trend.seasonTip", { index: i.index?.toFixed(2) ?? "—", unavail: av?.rate != null ? pct(av.rate) : "—" })}>
                      <span className="text-[10px] font-semibold text-ink tabular-nums">{i.index?.toFixed(2) ?? "—"}</span>
                      <span className="flex items-end h-[90px]"><span className={`w-5 rounded-t ${level ? LEVEL_BAR[level] : "bg-surface-sunken"}`} style={{ height: h }} /></span>
                      <span className="text-[10px] text-ink-muted">{mon(`2026-${String(i.month + 1).padStart(2, "0")}`, { month: "short" })}</span>
                      {av?.rate != null && av.rate >= 0.1 && <span className="text-[9px] text-warning">⚠ {pct(av.rate)}</span>}
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-ink-muted">
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-brand mr-1" />{t("trend.high")}</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-ink-faint/50 mr-1" />{t("trend.mid")}</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-warning-fill mr-1" />{t("trend.low")}</span>
                <span className="text-warning">⚠ {t("trend.fieldMonth")}</span>
              </div>
            </>
          )}
        </div>
      </GroupSection>
    </div>
  );
}
