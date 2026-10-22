import type { ContributionPayload } from "../../lib/db/reportContribution";
import { weekdayAbbr } from "../../lib/db/weekday";
import type { Locale } from "@/i18n/config";
import ReportSection from "./ReportSection";

type Translator = (key: string, values?: Record<string, string | number>) => string;

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;
const num = (n: number) => Math.round(n).toLocaleString("en-US");

// Aportes y puntos críticos (Reporte operativo): quién explica las cancelaciones y las confirmaciones del período, y dónde está el riesgo.
export default function ContributionSection({ data, t, locale }: { data: ContributionPayload; t: Translator; locale: Locale }) {
  const slot = (s: { field: string | null; day: string; time: string }) => `${s.field ?? t("contribution.noField")} · ${weekdayAbbr(s.day, locale)} ${s.time}`;
  const reason = (c: string | null) => (c ? data.categoryLabels[c] ?? c : "—");
  const li = "rounded-xl border border-border bg-surface-sunken/40 p-3 print:rounded-none print:border-0 print:border-b print:pb-2";
  const h = "text-xs font-semibold uppercase tracking-wide text-ink-muted mb-1.5 print:text-[8pt]";
  const body = "text-sm text-ink-muted print:text-[9pt]";

  return (
    <ReportSection title={t("contribution.title")}>
      <p className="text-xs text-ink-faint -mt-1 print:text-[8pt]">{t("contribution.intro")}</p>

      <div>
        <div className={h}>{t("contribution.cancel.title")}</div>
        {data.cancellations.length === 0 ? (
          <div className="text-sm text-ink-faint">{t("contribution.cancel.empty")}</div>
        ) : (
          <>
            <p className={`${body} mb-2`}>{t("contribution.cancel.summary", { n: data.cancelHalfAt, total: num(data.totals.cancelled) })}</p>
            <ul className="space-y-2">
              {data.cancellations.map((c) => (
                <li key={c.facilityId} className={li}>
                  <div className="font-display text-sm font-semibold text-ink print:text-[9.5pt]">{c.name} <span className="font-normal text-ink-faint">· {c.market}</span></div>
                  <p className={body}>{t("contribution.cancel.row", { share: pct(c.shareOfCancelled), cancelled: c.cancelled, games: c.games, rate: pct(c.cancelRate) })}</p>
                  <p className={`${body} mt-0.5`}>
                    <span className="text-ink font-medium">{t("contribution.cancel.reasons")}</span>{" "}
                    {c.reasons.map((r) => `${reason(r.category)} ${pct(r.pct)} (${r.count})`).join(" · ")}
                  </p>
                  {c.worstSlot && <p className={`${body} mt-0.5`}>{t("contribution.cancel.worstSlot", { slot: slot(c.worstSlot), cancelled: c.worstSlot.cancelled, games: c.worstSlot.games })}</p>}
                  <p className="text-sm text-ink font-medium mt-1 print:text-[9pt]"><span className="text-brand">{t("contribution.cancel.action")}</span> {t(c.actionKey)}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div>
        <div className={h}>{t("contribution.confirm.title")}</div>
        {data.confirmations.length === 0 ? (
          <div className="text-sm text-ink-faint">{t("contribution.confirm.empty")}</div>
        ) : (
          <ul className="space-y-2">
            {data.confirmations.map((c) => (
              <li key={c.facilityId} className={li}>
                <div className="font-display text-sm font-semibold text-ink print:text-[9.5pt]">{c.name} <span className="font-normal text-ink-faint">· {c.market}</span></div>
                <p className={body}>
                  {t("contribution.confirm.row", { share: pct(c.shareOfConfirmed), confirmed: c.confirmed, rate: pct(c.rate) })}
                  {c.changePct !== null && ` ${t("contribution.confirm.change", { pct: `${c.changePct >= 0 ? "+" : ""}${(c.changePct * 100).toFixed(0)}%` })}`}
                </p>
                {c.topSlots.length === 0 ? (
                  <p className="text-xs text-ink-faint mt-0.5">{t("contribution.confirm.noSlots")}</p>
                ) : (
                  <ul className="mt-1 list-disc list-inside space-y-0.5">
                    {c.topSlots.map((s, i) => (
                      <li key={i} className="text-sm text-ink print:text-[9pt]">{t("contribution.confirm.slot", { slot: slot(s), confirmed: s.confirmed, games: s.games, rate: pct(s.rate) })}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className={h}>{t("contribution.critical.title")}</div>
        {data.criticalSlots.length === 0 && data.criticalFacilities.length === 0 ? (
          <div className="text-sm text-ink-faint">{t("contribution.critical.empty")}</div>
        ) : (
          <div className="space-y-3">
            {data.criticalSlots.length > 0 && (
              <div>
                <div className="text-xs text-ink-faint mb-1">{t("contribution.critical.slots")}</div>
                <ul className="space-y-1">
                  {data.criticalSlots.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm print:text-[9pt]">
                      <span className="w-1.5 h-1.5 rounded-full bg-danger mt-1.5 shrink-0 print:bg-black" aria-hidden="true" />
                      <span className="text-ink">{t("contribution.critical.slotLine", { facility: s.name, slot: slot(s), cancelled: s.cancelled, games: s.games, rate: pct(s.rate), reason: reason(s.dominantCategory) })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.criticalFacilities.length > 0 && (
              <div>
                <div className="text-xs text-ink-faint mb-1">{t("contribution.critical.facilities")}</div>
                <ul className="space-y-1">
                  {data.criticalFacilities.map((f) => (
                    <li key={f.facilityId} className="flex items-start gap-2 text-sm print:text-[9pt]">
                      <span className="w-1.5 h-1.5 rounded-full bg-danger mt-1.5 shrink-0 print:bg-black" aria-hidden="true" />
                      <span className="text-ink">{t("contribution.critical.facilityLine", { facility: f.name, rate: pct1(f.rate), gap: (f.gap * 100).toFixed(0), networkRate: pct1(data.totals.cancelRate), reason: reason(f.dominantCategory) })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </ReportSection>
  );
}
