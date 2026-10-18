import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DIMENSIONS, type Dimension, type QuadrantKey, type Trend } from "../lib/facilityState";
import type { FacilityStateRow } from "../lib/db/facilityState";

// Estado calculado de la Bitácora (Fase 2). Componentes de servidor: solo muestran lo que ya calculó facilityState.ts.

const QUADRANT_STYLE: Record<QuadrantKey, string> = {
  PARTNER: "bg-brand-soft text-brand-deep",
  RELIABLE_DIFFICULT: "bg-warning-soft text-warning",
  OPPORTUNIST_CORDIAL: "bg-warning-soft text-warning",
  OPPORTUNIST_CONFLICT: "bg-danger-soft text-danger-deep",
  NO_SIGNAL: "bg-surface-panel text-ink-muted",
};
// Orden de la tabla: primero donde hay que actuar.
const QUADRANT_ORDER: Record<QuadrantKey, number> = { OPPORTUNIST_CONFLICT: 0, OPPORTUNIST_CORDIAL: 1, RELIABLE_DIFFICULT: 2, PARTNER: 3, NO_SIGNAL: 4 };
const TREND_ICON: Record<Trend, string> = { UP: "↑", DOWN: "↓", FLAT: "→" };
const TREND_STYLE: Record<Trend, string> = { UP: "text-brand", DOWN: "text-danger", FLAT: "text-ink-faint" };

const barColor = (score: number) => (score >= 50 ? "bg-brand" : score >= 35 ? "bg-warning-fill" : "bg-danger");
const pct = (n: number) => `${Math.round(n * 100)}%`;

function QuadrantBadge({ quadrant, label }: { quadrant: QuadrantKey; label: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${QUADRANT_STYLE[quadrant]}`}>{label}</span>;
}

function DimBar({ label, hint, score, noSignal }: { label: string; hint: string; score: number | null; noSignal: string }) {
  return (
    <div title={hint}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-ink">{label}</span>
        <span className={score === null ? "text-ink-faint" : "font-semibold text-ink"}>{score === null ? noSignal : score}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-surface-panel" role="img" aria-label={`${label}: ${score ?? noSignal}`}>
        {score !== null && <div className={`h-full rounded-full ${barColor(score)}`} style={{ width: `${Math.max(4, score)}%` }} />}
      </div>
    </div>
  );
}

/** Ficha de estado de UNA facility. */
export async function FacilityStateCard({ row }: { row: FacilityStateRow }) {
  const t = await getTranslations("FacilityLog.state");
  const s = row.state;
  const metric = (label: string, value: string, hint?: string) => (
    <div className="rounded-xl bg-surface-sunken px-3 py-2" title={hint}>
      <div className="text-[11px] text-ink-faint">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
  const dash = t("none");
  return (
    <section className="rounded-2xl bg-surface shadow-sm p-5 space-y-4" aria-label={t("title")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="font-display text-sm font-semibold text-ink">{t("title")}</h2>
        <QuadrantBadge quadrant={s.quadrant} label={t(`quadrants.${s.quadrant}.name`)} />
        {s.trend && <span className={`text-xs font-semibold ${TREND_STYLE[s.trend]}`}>{TREND_ICON[s.trend]} {t(`trend.${s.trend}`)}</span>}
        <span className="text-xs text-ink-faint">{t("confidenceLabel")}: {t(`confidence.${s.confidence}`)}</span>
      </div>

      <p className="text-sm text-ink-muted">{t(`quadrants.${s.quadrant}.hint`, { count: s.entryCount })}</p>
      {s.suggestedAction && (
        <p className="rounded-xl bg-surface-panel px-3 py-2 text-sm text-ink">
          <span className="font-semibold">{t("suggestedAction")}:</span> {t(`actions.${s.suggestedAction}`)}
        </p>
      )}

      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {DIMENSIONS.map((d: Dimension) => (
          <DimBar key={d} label={t(`dims.${d}.name`)} hint={t(`dims.${d}.hint`)} score={s.dims[d].score} noSignal={t("noSignal")} />
        ))}
      </div>
      <p className="text-xs text-ink-faint">
        {t("axes.reliability")}: <b className="text-ink">{s.reliability ?? dash}</b> · {t("axes.relation")}: <b className="text-ink">{s.relation ?? dash}</b>
      </p>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {metric(t("metrics.friction"), s.friction === null ? dash : s.friction.toLocaleString("en-US"), t("metrics.frictionHint"))}
        {metric(t("metrics.attributable"), s.attributableShare === null ? dash : `${s.attributableShare}%`, t("metrics.attributableHint"))}
        {metric(
          t("metrics.demand"),
          s.demandRate === null ? dash : row.marketDemandRate === null ? pct(s.demandRate) : t("metrics.demandVs", { rate: pct(s.demandRate), market: pct(row.marketDemandRate) }),
          t("metrics.demandHint"),
        )}
        {metric(t("metrics.requests"), s.requestsPerMonth.toLocaleString("en-US"), t("metrics.requestsHint"))}
        {metric(t("metrics.conflict"), s.conflictShare === null ? dash : `${s.conflictShare}%`, t("metrics.conflictHint"))}
      </div>

      {s.alerts.length > 0 && (
        <ul className="space-y-1.5">
          {s.alerts.map((a) => (
            <li key={a} className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-ink">
              <span className="font-semibold text-warning">{t(`alerts.${a}.name`)}:</span> {t(`alerts.${a}.hint`)}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-ink-faint">{t("footnote")}</p>
    </section>
  );
}

/** Panorama de varias facilities (mercado, región o toda la red): quien tiene aportes, ordenado por dónde conviene mirar primero. */
export async function FacilityStateTable({ rows, hrefFor }: { rows: FacilityStateRow[]; hrefFor: (facilityId: string) => string }) {
  const t = await getTranslations("FacilityLog.state");
  if (rows.length === 0) return null;
  const sorted = [...rows]
    .sort((a, b) => QUADRANT_ORDER[a.state.quadrant] - QUADRANT_ORDER[b.state.quadrant] || (b.state.friction ?? -1) - (a.state.friction ?? -1) || a.facilityName.localeCompare(b.facilityName))
    .slice(0, 50);
  const dash = t("none");
  return (
    <section className="rounded-2xl bg-surface shadow-sm p-5">
      <div className="mb-3">
        <h2 className="font-display text-sm font-semibold text-ink">{t("overviewTitle")}</h2>
        <p className="text-xs text-ink-faint">{t("overviewSubtitle", { count: rows.length })}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-faint">
              <th className="py-2 pr-3 font-medium">{t("table.facility")}</th>
              <th className="py-2 pr-3 font-medium">{t("table.quadrant")}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("axes.reliability")}</th>
              <th className="py-2 pr-3 text-right font-medium">{t("axes.relation")}</th>
              <th className="py-2 pr-3 text-right font-medium" title={t("metrics.frictionHint")}>{t("table.friction")}</th>
              <th className="py-2 pr-3 font-medium">{t("table.trend")}</th>
              <th className="py-2 font-medium">{t("table.confidence")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.facilityId} className="border-t border-border">
                <td className="py-2 pr-3">
                  <Link href={hrefFor(r.facilityId)} className="font-medium text-ink hover:text-brand">{r.facilityName}</Link>
                  <span className="ml-1.5 text-xs text-ink-faint">{r.marketName}</span>
                </td>
                <td className="py-2 pr-3"><QuadrantBadge quadrant={r.state.quadrant} label={t(`quadrants.${r.state.quadrant}.name`)} /></td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.state.reliability ?? dash}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.state.relation ?? dash}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.state.friction === null ? dash : r.state.friction.toLocaleString("en-US")}</td>
                <td className={`py-2 pr-3 text-xs font-semibold ${r.state.trend ? TREND_STYLE[r.state.trend] : "text-ink-faint"}`}>{r.state.trend ? TREND_ICON[r.state.trend] : dash}</td>
                <td className="py-2 text-xs text-ink-muted">{t(`confidence.${r.state.confidence}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > sorted.length && <p className="mt-2 text-xs text-ink-faint">{t("table.truncated", { shown: sorted.length, total: rows.length })}</p>}
    </section>
  );
}
