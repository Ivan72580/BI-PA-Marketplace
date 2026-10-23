import { getLocale, getTranslations } from "next-intl/server";
import { getFacilityDeep, getMustScheduleBoard, type FacilityDeep } from "../lib/db/queries";
import { DAY_ORDER, labelForCancellationCategory } from "../lib/db/shared";
import { weekdayAbbr, weekdayLabel } from "../lib/db/weekday";
import { opKey, type MonthAgg } from "../lib/facilityDeepCalc";
import type { Agg } from "../lib/facilityNowCalc";
import type { Locale } from "@/i18n/config";
import LayerSection from "./LayerSection";
import StatStrip, { type Stat } from "./StatStrip";
import ChangeBadge from "./ChangeBadge";
import Glossary from "./Glossary";
import ScheduleBoard from "./ScheduleBoard";

// Capas 3, 4 y 5 del análisis de facility: Oferta y slots, Demanda y operación, Precio y revenue. Comparten una
// sola lectura (getFacilityDeep) sobre la ventana reciente de 90 días y el historial de 13 meses.
// Definiciones: app/lib/metrics.ts y app/lib/facilityNowCalc.ts. Semáforo: verde ≥75 %, ámbar 55–75 %, rojo <55 %.

type T = (key: string, values?: Record<string, string | number>) => string;
const GREEN = 0.75;
const AMBER = 0.55;
const MIN_CELL = 3; // base de demanda mínima para colorear un slot (igual que MIN_SAMPLE)

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(0)}%`);
const usd = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const usd2 = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }));
const num = (n: number) => n.toLocaleString("en-US");
const rel = (cur: number | null, prior: number | null) => (cur !== null && prior !== null && prior > 0 ? cur / prior - 1 : null);

function tone(a: Agg): "good" | "warn" | "bad" | "none" {
  if (a.demandBase < MIN_CELL || a.demandRate === null) return "none";
  return a.demandRate >= GREEN ? "good" : a.demandRate >= AMBER ? "warn" : "bad";
}
const CELL = { good: "bg-brand-soft text-brand", warn: "bg-warning-soft text-warning", bad: "bg-danger-soft text-danger", none: "bg-surface-sunken text-ink-faint" } as const;
const BAR = { good: "bg-brand-fill", warn: "bg-warning-fill", bad: "bg-danger-fill", none: "bg-ink-faint/40" } as const;

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm p-5">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {sub && <p className="text-xs text-ink-muted mt-0.5 max-w-3xl">{sub}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`py-1.5 px-2 font-medium text-[10px] uppercase tracking-wide text-ink-faint ${right ? "text-right" : "text-left"}`}>{children}</th>;
}

// ---------- Capa 3: oferta y slots ----------

function HeatGrid({ deep, t, locale }: { deep: FacilityDeep; t: T; locale: Locale }) {
  const hours = [...new Set(Object.keys(deep.heat).map((k) => k.split("|")[1]))].sort((a, b) => opKey(a) - opKey(b));
  if (hours.length === 0) return <p className="text-sm text-ink-faint">{t("slots.heatEmpty")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-separate border-spacing-1 min-w-[520px]">
        <thead>
          <tr>
            <th />
            {DAY_ORDER.map((d) => <th key={d} className="font-medium text-ink-muted px-1">{weekdayAbbr(d, locale)}</th>)}
          </tr>
        </thead>
        <tbody>
          {hours.map((h) => (
            <tr key={h}>
              <th className="font-normal text-ink-faint pr-2 text-right whitespace-nowrap">{h}h</th>
              {DAY_ORDER.map((d) => {
                const a = deep.heat[`${d}|${h}`];
                if (!a) return <td key={d} className="rounded-md bg-surface-sunken/50 h-9 min-w-[44px]" />;
                const k = tone(a);
                const title = t("slots.cellTip", { day: weekdayLabel(d, locale), hour: h, n: a.published, conf: a.confirmed, rate: pct(a.demandRate), field: a.fieldUnavailable });
                return (
                  <td key={d} title={title} className={`relative rounded-md text-center h-9 min-w-[44px] font-semibold ${CELL[k]}`}>
                    {a.demandRate !== null && a.demandBase >= MIN_CELL ? pct(a.demandRate) : <span className="font-normal">·</span>}
                    <span className="block text-[9px] font-normal opacity-70 leading-none">{a.published}</span>
                    {a.fieldUnavailable > 0 && <span className="absolute top-0.5 right-1 text-warning-fill text-[10px] leading-none" aria-label={t("slots.fieldMark")}>⚠</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-ink-muted">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-brand-soft ring-1 ring-brand/30 mr-1" />≥ 75%</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-warning-soft ring-1 ring-warning/30 mr-1" />55–75%</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-danger-soft ring-1 ring-danger/30 mr-1" />&lt; 55%</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-surface-sunken ring-1 ring-ink-faint/30 mr-1" />{t("slots.lowSample", { n: MIN_CELL })}</span>
        <span className="text-warning">⚠ {t("slots.fieldMark")}</span>
      </div>
    </div>
  );
}

function FieldTable({ deep, t }: { deep: FacilityDeep; t: T }) {
  const rows = Object.entries(deep.byField).sort((a, b) => b[1].published - a[1].published);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead><tr><Th>{t("slots.field")}</Th><Th right>{t("now.row.published")}</Th><Th right>{t("now.row.demandRate")}</Th><Th right>{t("now.row.fill")}</Th><Th right>{t("now.field.title")}</Th></tr></thead>
        <tbody>
          {rows.map(([name, a]) => (
            <tr key={name || "?"} className="border-t border-surface-sunken">
              <td className={`py-1.5 px-2 ${name ? "text-ink" : "text-warning"}`}>{name || t("slots.fieldUnknown")}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{num(a.published)}</td>
              <td className="py-1.5 px-2 text-right font-semibold text-ink">{pct(a.demandRate)}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{pct(a.fillRate)}</td>
              <td className={`py-1.5 px-2 text-right ${a.fieldUnavailable > 0 ? "text-warning font-semibold" : "text-ink-faint"}`}>{a.fieldUnavailable > 0 ? `${a.fieldUnavailable} (${pct(a.fieldShare)})` : "0"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Capa 4: demanda y operación ----------

function Reasons({ deep, t, locale }: { deep: FacilityDeep; t: T; locale: Locale }) {
  if (deep.reasons.length === 0) return <p className="text-sm text-ink-faint">{t("demand.noCancel")}</p>;
  const max = Math.max(...deep.reasons.map((r) => r.cur), 1);
  return (
    <ul className="space-y-2">
      {deep.reasons.map((r) => {
        const field = r.category === "FACILITY_UNAVAILABLE";
        return (
          <li key={r.category} className="grid grid-cols-[minmax(110px,1fr)_2fr_auto] items-center gap-3 text-sm">
            <span className={`truncate ${field ? "text-warning font-semibold" : "text-ink-muted"}`}>{labelForCancellationCategory(r.category, locale)}</span>
            <span className="h-2.5 rounded-full bg-surface-sunken overflow-hidden"><span className={`block h-2.5 ${field ? "bg-warning-fill" : r.category === "NOT_ENOUGH_PLAYERS" ? "bg-danger-fill" : "bg-ink-faint/60"}`} style={{ width: `${(r.cur / max) * 100}%` }} /></span>
            <span className="flex items-baseline gap-2 justify-end"><span className="font-semibold text-ink tabular-nums">{r.cur}</span><ChangeBadge value={rel(r.cur, r.prior)} invert /></span>
          </li>
        );
      })}
    </ul>
  );
}

function WeekdayBars({ deep, t, locale }: { deep: FacilityDeep; t: T; locale: Locale }) {
  return (
    <ul className="space-y-1.5">
      {DAY_ORDER.map((d) => {
        const a = deep.byWeekday[d];
        if (!a) return null;
        const k = tone(a);
        return (
          <li key={d} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 text-sm">
            <span className="text-ink-muted">{weekdayAbbr(d, locale)}</span>
            <span className="h-2.5 rounded-full bg-surface-sunken overflow-hidden"><span className={`block h-2.5 ${BAR[k]}`} style={{ width: `${(a.demandRate ?? 0) * 100}%` }} /></span>
            <span className="text-right tabular-nums"><span className="font-semibold text-ink">{pct(a.demandRate)}</span> <span className="text-[11px] text-ink-faint">{t("demand.ofN", { n: a.published })}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

function FormatTable({ deep, t }: { deep: FacilityDeep; t: T }) {
  const rows = Object.entries(deep.byFormat.cur).sort((a, b) => b[1].published - a[1].published);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead><tr><Th>{t("demand.format")}</Th><Th right>{t("now.row.published")}</Th><Th right>{t("now.row.demandRate")}</Th><Th right>{t("now.row.fill")}</Th><Th right>{t("now.row.waitlist")}</Th><Th right>{t("now.row.dropped")}</Th></tr></thead>
        <tbody>
          {rows.map(([f, a]) => (
            <tr key={f || "?"} className="border-t border-surface-sunken">
              <td className="py-1.5 px-2 text-ink">{f || "—"}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{num(a.published)}</td>
              <td className="py-1.5 px-2 text-right font-semibold text-ink">{pct(a.demandRate)}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{pct(a.fillRate)}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{num(a.waitlist)}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted">{num(a.dropped)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Capa 5: precio y revenue ----------

function MonthBars({ monthly, t, lc }: { monthly: MonthAgg[]; t: T; lc: string }) {
  const max = Math.max(...monthly.map((m) => m.agg.revenue ?? 0), 1);
  const label = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(lc, { month: "short", year: "2-digit", timeZone: "UTC" });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[520px]">
        <thead><tr><Th>{t("price.month")}</Th><Th>{t("now.row.revenue")}</Th><Th right>{t("now.row.avgPrice")}</Th><Th right>{t("now.row.confirmed")}</Th></tr></thead>
        <tbody>
          {monthly.map((m, i) => (
            <tr key={m.month} className="border-t border-surface-sunken">
              <td className="py-1.5 px-2 text-ink-muted whitespace-nowrap">{label(m.month)}{i === monthly.length - 1 && <span className="text-[10px] text-ink-faint"> · {t("price.partial")}</span>}</td>
              <td className="py-1.5 px-2 w-1/2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 rounded-full bg-surface-sunken flex-1 overflow-hidden"><span className="block h-2.5 bg-brand-fill" style={{ width: `${((m.agg.revenue ?? 0) / max) * 100}%` }} /></span>
                  <span className="tabular-nums text-ink font-semibold w-16 text-right">{usd(m.agg.revenue)}</span>
                </div>
              </td>
              <td className="py-1.5 px-2 text-right text-ink-muted tabular-nums">{usd2(m.agg.avgPrice)}</td>
              <td className="py-1.5 px-2 text-right text-ink-muted tabular-nums">{num(m.agg.confirmed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceByFormat({ deep, t }: { deep: FacilityDeep; t: T }) {
  const rows = Object.entries(deep.byFormat.cur).filter(([, a]) => a.avgPrice !== null).sort((a, b) => b[1].published - a[1].published);
  if (rows.length === 0) return <p className="text-sm text-ink-faint">{t("price.noPrice")}</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr><Th>{t("demand.format")}</Th><Th right>{t("now.row.avgPrice")}</Th><Th right>{t("price.vsPrior")}</Th><Th right>{t("now.row.revenue")}</Th></tr></thead>
      <tbody>
        {rows.map(([f, a]) => (
          <tr key={f || "?"} className="border-t border-surface-sunken">
            <td className="py-1.5 px-2 text-ink">{f || "—"}</td>
            <td className="py-1.5 px-2 text-right font-semibold text-ink">{usd2(a.avgPrice)}</td>
            <td className="py-1.5 px-2 text-right"><ChangeBadge value={rel(a.avgPrice, deep.byFormat.prior[f]?.avgPrice ?? null)} /></td>
            <td className="py-1.5 px-2 text-right text-ink-muted">{usd(a.revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PriceByHour({ deep, t }: { deep: FacilityDeep; t: T }) {
  const rows = Object.entries(deep.byHour).filter(([, a]) => a.avgPrice !== null).sort((a, b) => opKey(a[0]) - opKey(b[0]));
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map(([, a]) => a.avgPrice ?? 0), 1);
  return (
    <ul className="space-y-1.5">
      {rows.map(([h, a]) => (
        <li key={h} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 text-sm">
          <span className="text-ink-faint">{h}h</span>
          <span className="h-2.5 rounded-full bg-surface-sunken overflow-hidden"><span className="block h-2.5 bg-brand-fill" style={{ width: `${((a.avgPrice ?? 0) / max) * 100}%` }} /></span>
          <span className="text-right tabular-nums"><span className="font-semibold text-ink">{usd2(a.avgPrice)}</span> <span className="text-[11px] text-ink-faint">{t("demand.ofN", { n: a.published })}</span></span>
        </li>
      ))}
    </ul>
  );
}

export default async function Facility360Deep({ facilityId, date }: { facilityId: string; date?: string }) {
  const [tr, locale, deep, board, tInv] = await Promise.all([
    getTranslations("Facility360"),
    getLocale(),
    getFacilityDeep(facilityId, date),
    getMustScheduleBoard({ facilityId }),
    getTranslations("Inventory"),
  ]);
  if (!deep) return null;
  const t = tr as unknown as T;
  const lc = locale === "en" ? "en-US" : "es-AR";
  const { cur, prior } = deep;
  const per = t("deep.window", { n: 90 });

  const slotStats: Stat[] = [
    { label: t("slots.stat.fields"), value: String(Object.keys(deep.byField).filter((k) => k).length), sub: t("slots.stat.fieldsSub") },
    { label: t("slots.stat.slots"), value: String(Object.keys(deep.heat).length), sub: t("slots.stat.slotsSub") },
    { label: t("slots.stat.published"), value: num(cur.published), sub: t("deep.vsPrior", { n: num(prior.published) }) },
    { label: t("now.field.title"), value: cur.fieldUnavailable > 0 ? `${num(cur.fieldUnavailable)} · ${pct(cur.fieldShare)}` : "0", sub: t("slots.stat.fieldSub"), tone: cur.fieldUnavailable > 0 ? "warn" : "default" },
  ];
  const demandStats: Stat[] = [
    { label: t("now.row.demandRate"), value: pct(cur.demandRate), sub: cur.demandRate !== null && prior.demandRate !== null ? t("demand.statVs", { pct: pct(prior.demandRate) }) : per },
    { label: t("now.row.fill"), value: pct(cur.fillRate), sub: per },
    { label: t("now.row.waitlist"), value: num(cur.waitlist), sub: t("demand.waitlistSub") },
    { label: t("now.row.dropped"), value: num(cur.dropped), sub: t("demand.droppedSub"), tone: cur.dropped > 0 ? "warn" : "default" },
  ];
  const perConfirmed = cur.revenue !== null && cur.confirmed > 0 ? cur.revenue / cur.confirmed : null;
  const priceStats: Stat[] = [
    { label: t("now.row.avgPrice"), value: usd2(cur.avgPrice), sub: <ChangeBadge value={rel(cur.avgPrice, prior.avgPrice)} /> },
    { label: t("now.row.revenue"), value: usd(cur.revenue), sub: <ChangeBadge value={rel(cur.revenue, prior.revenue)} /> },
    { label: t("price.perGame"), value: usd(perConfirmed), sub: t("price.perGameSub") },
    { label: t("price.playersPerGame"), value: cur.confirmed > 0 ? (cur.players / cur.confirmed).toFixed(1) : "—", sub: per },
  ];

  return (
    <>
      <LayerSection id="slots" title={t("nav.slots")} subtitle={t("layerSub.slots")}>
          <StatStrip stats={slotStats} />
          <Card title={t("slots.heatTitle")} sub={t("slots.heatSub", { n: 90 })}><HeatGrid deep={deep} t={t} locale={locale as Locale} /></Card>
          <Card title={t("slots.fieldTitle")} sub={t("slots.fieldSub")}><FieldTable deep={deep} t={t} /></Card>
          {board && board.cards.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-ink mb-1">{t("slots.boardTitle")}</h3>
              <p className="text-xs text-ink-muted mb-3 max-w-3xl">{t("slots.boardSub")}</p>
              <ScheduleBoard board={board} t={tInv as unknown as T} locale={locale as Locale} order="time" />
            </div>
          )}
        </LayerSection>

      <LayerSection id="demanda" title={t("nav.demand")} subtitle={t("layerSub.demand")}>
          <StatStrip stats={demandStats} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title={t("demand.reasonsTitle")} sub={t("demand.reasonsSub")}><Reasons deep={deep} t={t} locale={locale as Locale} /></Card>
            <Card title={t("demand.weekdayTitle")} sub={t("demand.weekdaySub")}><WeekdayBars deep={deep} t={t} locale={locale as Locale} /></Card>
          </div>
          <Card title={t("demand.formatTitle")}><FormatTable deep={deep} t={t} /></Card>
        </LayerSection>

      <LayerSection id="precio" title={t("nav.price")} subtitle={t("layerSub.price")}>
          <StatStrip stats={priceStats} />
          <Card title={t("price.monthlyTitle")} sub={t("price.monthlySub")}><MonthBars monthly={deep.monthly} t={t} lc={lc} /></Card>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title={t("price.formatTitle")} sub={t("price.formatSub")}><PriceByFormat deep={deep} t={t} /></Card>
            <Card title={t("price.hourTitle")}><PriceByHour deep={deep} t={t} /></Card>
          </div>
          <Glossary items={[{ term: t("price.revenueTerm"), def: t("price.caveat") }]} />
        </LayerSection>
    </>
  );
}
