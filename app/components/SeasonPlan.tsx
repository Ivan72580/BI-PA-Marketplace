import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import GroupSection from "./GroupSection";
import type { SeasonPlanData, SeasonRow, PlanItem } from "../lib/db/seasonPlan";
import type { ActionKind, SeasonLevel } from "../lib/seasonPlanCalc";

// Vista de temporadas por volumen de demanda (ver app/lib/seasonPlanCalc.ts para las
// definiciones). Dos filas de barras comparten las mismas 12 columnas — volumen arriba,
// cancha no disponible abajo — en vez de un gráfico de doble eje: así se lee de un vistazo
// "este mes tiene mucha demanda Y se pierde mucha cancha" sin mezclar escalas.

const LEVEL_BAR: Record<SeasonLevel, string> = { high: "bg-brand", mid: "bg-border-strong", low: "bg-ink-faint" };
const LEVEL_BADGE: Record<SeasonLevel, string> = {
  high: "bg-brand-soft text-brand",
  mid: "bg-surface-sunken text-ink-muted",
  low: "bg-surface-sunken text-ink-faint",
};
const ACTION_STYLE: Record<ActionKind, string> = {
  supplyLimited: "text-brand font-medium",
  mixed: "text-warning font-medium",
  demandLimited: "text-ink-muted",
  healthy: "text-ink-faint",
  insufficient: "text-ink-faint",
};

export default async function SeasonPlan({ data, forecastHref }: { data: SeasonPlanData | null; forecastHref?: string }) {
  const [t, locale] = await Promise.all([getTranslations("Seasonality.plan"), getLocale()]);
  const lc = locale === "en" ? "en-US" : "es-AR";
  const monthShort = (m: number) => new Date(Date.UTC(2000, m, 1)).toLocaleDateString(lc, { month: "short", timeZone: "UTC" });
  const pct0 = new Intl.NumberFormat(lc, { style: "percent", maximumFractionDigits: 0 });
  const pct1 = (v: number | null) => (v === null ? "—" : pct0.format(v));
  const idx2 = new Intl.NumberFormat(lc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const seasonLabel = (months: number[]) => (months.length === 1 ? monthShort(months[0]) : `${monthShort(months[0])}–${monthShort(months[months.length - 1])}`);
  const trendLabel = (pp: number | null) => {
    if (pp === null) return "—";
    const v = Math.round(pp * 1000) / 10; // puntos porcentuales con 1 decimal
    if (Math.abs(v) < 0.5) return t("trend.flat");
    return `${v > 0 ? "▲ +" : "▼ "}${new Intl.NumberFormat(lc, { maximumFractionDigits: 1 }).format(v)} pp`;
  };

  if (!data || data.method === null) {
    return (
      <GroupSection title={t("title")}>
        <div className="text-sm text-ink-faint">{t("insufficient", { n: data?.completeMonths ?? 0 })}</div>
      </GroupSection>
    );
  }

  const maxIdx = Math.max(1.2, ...data.index.map((m) => m.index ?? 0));
  const maxRate = Math.max(0.1, ...data.availability.map((m) => m.rate ?? 0));
  const BAR_H = 88;

  const actionText = (a: ActionKind) => t(`action.${a}`);

  return (
    <>
      <GroupSection title={t("title")}>
        <div className="text-xs text-ink-faint -mt-1 mb-3 max-w-3xl">{t("subtitle")}</div>
        <div className={`text-xs mb-4 ${data.method === "provisional" ? "text-warning" : "text-ink-muted"}`}>
          {data.method === "provisional" ? t("methodProvisional", { n: data.completeMonths }) : t("methodCentered", { n: data.completeMonths })}
        </div>

        <div className="grid grid-cols-12 gap-1.5 items-end" role="img" aria-label={t("indexRow")}>
          {data.index.map((m) => {
            const h = m.index === null ? 0 : Math.max(2, (m.index / maxIdx) * BAR_H);
            const level = m.index === null ? null : m.index >= 1.1 ? "high" : m.index <= 0.9 ? "low" : "mid";
            return (
              <div key={m.month} className="flex flex-col items-center justify-end" style={{ height: BAR_H + 18 }} title={m.index === null ? t("noData") : `${monthShort(m.month)}: ${idx2.format(m.index)}`}>
                <span className="text-[10px] text-ink-muted mb-0.5">{m.index === null ? "—" : idx2.format(m.index)}</span>
                <div className={`w-full max-w-[28px] rounded-t-[4px] ${level ? LEVEL_BAR[level] : "bg-border"}`} style={{ height: h }} />
              </div>
            );
          })}
        </div>
        <div className="text-[11px] text-ink-faint mt-1 mb-4">{t("indexRow")}</div>

        <div className="grid grid-cols-12 gap-1.5 items-start" role="img" aria-label={t("unavailRow")}>
          {data.availability.map((m) => {
            const h = m.rate === null ? 0 : Math.max(2, (m.rate / maxRate) * 44);
            return (
              <div key={m.month} className="flex flex-col items-center" title={m.rate === null ? t("noData") : `${monthShort(m.month)}: ${pct0.format(m.rate)} · ${trendLabel(m.trendPp)}`}>
                <div className="w-full max-w-[28px] rounded-b-[4px] bg-danger/80" style={{ height: h }} />
                <span className="text-[10px] text-ink-muted mt-0.5">{pct1(m.rate)}</span>
                <span className="text-[10px] text-ink-faint">{monthShort(m.month)}</span>
              </div>
            );
          })}
        </div>
        <div className="text-[11px] text-ink-faint mt-1 mb-5">{t("unavailRow")}</div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-ink-faint text-[10px] uppercase tracking-wide">
              <tr>
                <th className="text-left py-1.5 pr-2 font-medium">{t("headers.season")}</th>
                <th className="text-left py-1.5 px-2 font-medium">{t("headers.level")}</th>
                <th className="text-right py-1.5 px-2 font-medium">{t("headers.index")}</th>
                <th className="text-right py-1.5 px-2 font-medium">{t("headers.share")}</th>
                <th className="text-right py-1.5 px-2 font-medium">{t("headers.demandRate")}</th>
                <th className="text-right py-1.5 px-2 font-medium">{t("headers.unavailRate")}</th>
                <th className="text-right py-1.5 px-2 font-medium">{t("headers.trend")}</th>
                <th className="text-left py-1.5 pl-3 font-medium">{t("headers.reading")}</th>
              </tr>
            </thead>
            <tbody>
              {data.seasons.map((s: SeasonRow) => (
                <tr key={s.months.join("-")} className="border-t border-border">
                  <td className="py-1.5 pr-2 text-ink font-medium whitespace-nowrap">{seasonLabel(s.months)}</td>
                  <td className="py-1.5 px-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${LEVEL_BADGE[s.level]}`}>{t(`level.${s.level}`)}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right text-ink">{idx2.format(s.avgIndex)}</td>
                  <td className="py-1.5 px-2 text-right text-ink-muted">{pct1(s.shareOfDemandVolume)}</td>
                  <td className="py-1.5 px-2 text-right text-ink-muted">{pct1(s.demandRate)}</td>
                  <td className="py-1.5 px-2 text-right text-ink-muted">{pct1(s.unavailRate)}</td>
                  <td className="py-1.5 px-2 text-right text-ink-muted whitespace-nowrap">{trendLabel(s.trendPp)}</td>
                  <td className={`py-1.5 pl-3 text-xs ${ACTION_STYLE[s.action]}`}>{actionText(s.action)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-ink-faint mt-2 max-w-3xl">{t("footnote", { demand: pct0.format(0.55), unavail: pct0.format(0.1) })}</div>
        {forecastHref && (
          <Link href={forecastHref} className="inline-block mt-3 text-sm text-brand hover:underline">{t("seePlan")} →</Link>
        )}
      </GroupSection>
    </>
  );
}

// Plan de reservas a futuro (próximos 3 meses). Vive en Pronóstico: parte de la estacionalidad observada
// (SeasonPlan, arriba) pero es una mirada hacia adelante, no un registro del histórico.
export async function ReservePlan({ data, badge }: { data: SeasonPlanData | null; badge: string }) {
  const [t, locale] = await Promise.all([getTranslations("Seasonality.plan"), getLocale()]);
  const lc = locale === "en" ? "en-US" : "es-AR";
  const monthLong = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toLocaleDateString(lc, { month: "long", year: "numeric", timeZone: "UTC" });
  const pct0 = new Intl.NumberFormat(lc, { style: "percent", maximumFractionDigits: 0 });
  const pct1 = (v: number | null) => (v === null ? "—" : pct0.format(v));
  const num0 = new Intl.NumberFormat(lc, { maximumFractionDigits: 0 });
  const trendLabel = (pp: number | null) => {
    if (pp === null) return "—";
    const v = Math.round(pp * 1000) / 10;
    if (Math.abs(v) < 0.5) return t("trend.flat");
    return `${v > 0 ? "▲ +" : "▼ "}${new Intl.NumberFormat(lc, { maximumFractionDigits: 1 }).format(v)} pp`;
  };
  const dateLabel = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(lc, { day: "numeric", month: "short", timeZone: "UTC" });
  const actionText = (a: ActionKind) => t(`action.${a}`);

  if (!data || data.method === null) return null;

  return (
    <>
      <GroupSection title={`📅 ${t("planTitle")}`} accent="warning" badge={badge}>
        <div className="text-xs text-ink-faint -mt-1 mb-3 max-w-3xl">{t("planSubtitle")}</div>
        <div className="grid gap-2 sm:grid-cols-3 mb-4">
          {data.planMonths.map((pm) => (
            <div key={`${pm.year}-${pm.month}`} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-ink capitalize">{monthLong(pm.year, pm.month)}</div>
                {pm.level && <span className={`rounded-full px-2 py-0.5 text-[11px] ${LEVEL_BADGE[pm.level]}`}>{t(`level.${pm.level}`)}</span>}
              </div>
              <div className="text-[11px] text-ink-faint mt-1">
                {t("countsLine", { supply: pm.counts.supplyLimited, mixed: pm.counts.mixed, demand: pm.counts.demandLimited })}
              </div>
            </div>
          ))}
        </div>

        {data.planItems.length === 0 ? (
          <div className="text-sm text-ink-faint">{t("planEmpty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-ink-faint text-[10px] uppercase tracking-wide">
                <tr>
                  <th className="text-left py-1.5 pr-2 font-medium">{t("headers.facility")}</th>
                  <th className="text-left py-1.5 px-2 font-medium">{t("headers.month")}</th>
                  <th className="text-right py-1.5 px-2 font-medium">{t("headers.demandRate")}</th>
                  <th className="text-right py-1.5 px-2 font-medium">{t("headers.unavailRate")}</th>
                  <th className="text-right py-1.5 px-2 font-medium">{t("headers.trend")}</th>
                  <th className="text-right py-1.5 px-2 font-medium">{t("headers.lost")}</th>
                  <th className="text-left py-1.5 pl-3 font-medium">{t("headers.reserveBy")}</th>
                </tr>
              </thead>
              <tbody>
                {data.planItems.map((it: PlanItem) => (
                  <tr key={`${it.facilityId}-${it.year}-${it.month}`} className="border-t border-border align-top">
                    <td className="py-1.5 pr-2 text-ink">
                      <div className="font-medium">{it.facilityName}</div>
                      <div className={`text-[11px] ${ACTION_STYLE[it.kind]}`}>{actionText(it.kind)}</div>
                    </td>
                    <td className="py-1.5 px-2 text-ink-muted capitalize whitespace-nowrap">{monthLong(it.year, it.month)}</td>
                    <td className="py-1.5 px-2 text-right text-ink-muted">{pct1(it.demandRate)}</td>
                    <td className="py-1.5 px-2 text-right text-ink-muted">{pct1(it.unavailRate)}</td>
                    <td className="py-1.5 px-2 text-right text-ink-muted whitespace-nowrap">{trendLabel(it.trendPp)}</td>
                    <td className="py-1.5 px-2 text-right text-ink">{num0.format(Math.round(it.avgLostPerYear))}</td>
                    <td className="py-1.5 pl-3 whitespace-nowrap">
                      {it.overdue ? (
                        <span className="text-danger font-medium">{t("overdue")}</span>
                      ) : (
                        <span className="text-ink">
                          {dateLabel(it.reserveBy)} <span className="text-ink-faint text-[11px]">({t("weeksBefore", { n: it.leadWeeks })})</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-[11px] text-ink-faint mt-2 max-w-3xl">{t("planFootnote")}</div>
      </GroupSection>
    </>
  );
}
