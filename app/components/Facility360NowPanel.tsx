"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import ChangeBadge from "./ChangeBadge";
import type { Agg, MarketAgg, NowPeriod, NowWindows } from "../lib/facilityNowCalc";

// Panorama de la capa "Ahora": una tarjeta con selector Día | Semana | Mes (los tres períodos ya vienen
// cargados, el cambio es instantáneo) y los indicadores clave, cada uno con link a la página que muestra el
// dato en detalle. Cancelaciones lleva la composición y el detalle de cancha no disponible, que es la fricción
// directa contra el crecimiento de confirmados, con los slots donde conviene reservar (reserveAdvice.ts).

type T = (key: string, values?: Record<string, string | number>) => string;
const PERIODS: NowPeriod[] = ["day", "week", "month"];

export type ReserveItem = { key: string; day: string; time: string; field: string | null; size: string | null; level: "strong" | "test"; players: number; usual: number };
export type PanelPeriod = { cur: Agg; prior: Agg; market: { cur: MarketAgg; prior: MarketAgg } | null };
export type PanelProps = {
  periods: Record<NowPeriod, PanelPeriod>;
  windows: NowWindows;
  refISO: string;
  scope: { regionId: string; marketId: string; facilityId: string };
  reserve: { items: ReserveItem[]; total: number };
};

const pct = (n: number | null, d = 0) => (n === null ? "—" : `${(n * 100).toFixed(d)}%`);
const usd = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const usd2 = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }));
const num = (n: number) => n.toLocaleString("en-US");
const rel = (cur: number | null, prior: number | null) => (cur !== null && prior !== null && prior > 0 ? cur / prior - 1 : null);
const pts = (cur: number | null, prior: number | null) => (cur !== null && prior !== null ? cur - prior : null);

function Tile({ label, value, delta, unit = "pct", invert, href, note, strong, openLabel }: {
  label: string; value: string; delta: number | null; unit?: "pct" | "pts"; invert?: boolean; href: string; note?: React.ReactNode; strong?: boolean; openLabel: string;
}) {
  return (
    <Link href={href} title={openLabel} className="group relative block rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-4 min-w-0">
      <span className="absolute top-3 right-3 text-ink-faint group-hover:text-brand transition-colors text-sm" aria-hidden="true">↗</span>
      <div className="text-[11px] uppercase tracking-wide text-ink-faint pr-5 truncate">{label}</div>
      <div className={`font-display font-bold text-ink mt-1 ${strong ? "text-3xl" : "text-2xl"}`}>{value}</div>
      <div className="mt-1"><ChangeBadge value={delta} unit={unit} invert={invert} /></div>
      {note && <div className="text-[11px] text-ink-faint mt-1 leading-snug">{note}</div>}
    </Link>
  );
}

export default function Facility360NowPanel({ periods, windows, refISO, scope, reserve }: PanelProps) {
  const tr = useTranslations("Facility360");
  const t = tr as unknown as T;
  const lc = useLocale() === "en" ? "en-US" : "es-AR";
  const [p, setP] = useState<NowPeriod>("week");
  const { cur, prior, market } = periods[p];
  const mk = market?.cur;

  const f = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(lc, { ...o, timeZone: "UTC" });
  const range = (q: NowPeriod) => {
    const { from, to } = windows[q].cur;
    return q === "day" ? f(to, { weekday: "short", day: "numeric", month: "short" }) : `${f(from, { day: "numeric", month: "short" })} – ${f(to, { day: "numeric", month: "short" })}`;
  };

  // Destinos: cada indicador abre la página que lo muestra, con la misma facility y el período elegido.
  const q = (extra: Record<string, string>) => new URLSearchParams({ regionId: scope.regionId, marketId: scope.marketId, facilityId: scope.facilityId, ...extra }).toString();
  const per = { granularity: p, period: refISO };
  const to = {
    overview: `/?${q(per)}`,
    trends: `/trends?${q({})}`,
    inventory: `/inventory?${q({ view: "slots" })}`,
    price: `/market?${q({ tab: "precio" })}`,
  };
  const open = t("now.panel.open");

  const lowSample = p === "day" && cur.demandBase > 0 && cur.demandBase < 5;
  const gap = mk && mk.demandRate !== null && cur.demandRate !== null ? cur.demandRate - mk.demandRate : null;
  const fieldGap = mk && mk.fieldShare !== null && cur.fieldShare !== null ? cur.fieldShare - mk.fieldShare : null;
  const comp = [
    { k: "demand", n: cur.demandCancelled, cls: "bg-danger-fill" },
    { k: "field", n: cur.fieldUnavailable, cls: "bg-warning-fill" },
    { k: "operational", n: cur.operational, cls: "bg-ink-faint/60" },
    { k: "plugin", n: cur.plugin, cls: "bg-ink-faint/30" },
  ];

  return (
    <div className="rounded-2xl bg-surface-sunken/60 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{t("now.panel.title")}</h3>
          <p className="text-xs text-ink-muted mt-0.5">{range(p)} · {t(`now.vs.${p}`)}</p>
        </div>
        <div role="tablist" aria-label={t("now.panel.period")} className="inline-flex gap-0.5 rounded-full bg-surface p-1 shadow-sm">
          {PERIODS.map((x) => (
            <button
              key={x}
              type="button"
              role="tab"
              aria-selected={p === x}
              onClick={() => setP(x)}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${p === x ? "bg-brand-fill text-white font-semibold" : "text-ink-muted font-medium hover:text-ink"}`}
            >
              {t(`now.period.${x}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Tile
          strong openLabel={open} href={to.trends} label={t("now.row.demandRate")} value={pct(cur.demandRate)} unit="pts" delta={pts(cur.demandRate, prior.demandRate)}
          note={<>
            {mk && mk.demandRate !== null && <span>{t("now.field.market", { pct: pct(mk.demandRate) })}{gap !== null && <span className={gap >= 0 ? "text-brand" : "text-danger"}> ({gap >= 0 ? "+" : ""}{(gap * 100).toFixed(0)} {t("now.field.pp")})</span>}</span>}
            {lowSample && <span className="block text-warning">{t("now.lowSample", { n: cur.demandBase })}</span>}
          </>}
        />
        <Tile openLabel={open} href={to.inventory} label={t("now.row.published")} value={num(cur.published)} delta={rel(cur.published, prior.published)} />
        <Tile openLabel={open} href={to.trends} label={t("now.row.confirmed")} value={num(cur.confirmed)} delta={rel(cur.confirmed, prior.confirmed)} />

        {/* Cancelaciones: composición + detalle de cancha no disponible con la sugerencia de reserva */}
        <div className="col-span-2 lg:col-span-3 rounded-2xl bg-surface shadow-sm p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">{t("now.row.cancelled")}</div>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="font-display text-3xl font-bold text-ink">{num(cur.cancelled)}</span>
                <ChangeBadge value={rel(cur.cancelled, prior.cancelled)} invert />
              </div>
            </div>
            <Link href={to.overview} className="text-xs text-brand hover:underline">{t("now.cancel.open")} ↗</Link>
          </div>

          {cur.cancelled > 0 ? (
            <div className="mt-3">
              <div className="flex h-3 rounded-full overflow-hidden bg-surface-sunken" role="img" aria-label={t("now.cancel.composition")}>
                {comp.filter((c) => c.n > 0).map((c) => <div key={c.k} className={c.cls} style={{ width: `${(c.n / cur.cancelled) * 100}%` }} title={`${t(`now.cancel.${c.k}`)}: ${c.n}`} />)}
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-ink-muted">
                {comp.map((c) => (
                  <li key={c.k} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${c.cls}`} aria-hidden="true" />{t(`now.cancel.${c.k}`)}: <span className="font-semibold text-ink">{c.n}</span></li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-ink-faint mt-3">{t("now.cancel.none")}</p>
          )}

          {/* Cancha no disponible: lo que más pega en los confirmados */}
          <div className="mt-4 rounded-xl bg-warning-soft ring-1 ring-warning-fill/40 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h4 className="text-sm font-semibold text-ink"><span className="text-warning" aria-hidden="true">⚠</span> {t("now.field.title")}</h4>
              <span className={`font-display text-xl font-bold ${cur.fieldUnavailable > 0 ? "text-warning" : "text-ink"}`}>{num(cur.fieldUnavailable)}</span>
              <span className="text-xs text-ink-muted">{t("now.field.ofPublished", { pct: pct(cur.fieldShare, 1), n: num(cur.published) })}</span>
              <ChangeBadge value={rel(cur.fieldUnavailable, prior.fieldUnavailable)} invert />
              {mk && mk.fieldShare !== null && (
                <span className="text-xs text-ink-faint">
                  {t("now.field.market", { pct: pct(mk.fieldShare, 1) })}
                  {fieldGap !== null && Math.abs(fieldGap) >= 0.005 && <span className={fieldGap > 0 ? "text-danger" : "text-brand"}> ({fieldGap > 0 ? "+" : ""}{(fieldGap * 100).toFixed(1)} {t("now.field.pp")})</span>}
                </span>
              )}
            </div>
            <p className="text-xs text-ink-muted mt-1">{t("now.field.subtitle")}</p>

            <div className="mt-3">
              <div className="flex items-baseline justify-between gap-2">
                <h5 className="text-xs font-semibold text-ink">{t("now.reserve.title")}</h5>
                <a href="#pronostico" className="text-[11px] text-brand hover:underline">{t("now.reserve.open")} →</a>
              </div>
              {reserve.items.length === 0 ? (
                <p className="text-xs text-ink-faint mt-1">{t("now.reserve.none")}</p>
              ) : (
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {reserve.items.map((r) => (
                    <li key={r.key} className="rounded-lg bg-surface px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink truncate">{r.day} {r.time}</div>
                        <div className="text-[11px] text-ink-muted truncate">{r.field ?? t("slots.fieldUnknown")}{r.size ? ` · ${r.size}` : ""} · {t("now.reserve.players", { players: r.players, usual: r.usual.toFixed(1) })}</div>
                      </div>
                      <span className={`shrink-0 rounded-full text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 ${r.level === "strong" ? "bg-ink text-surface" : "border border-ink text-ink"}`}>
                        {t(r.level === "strong" ? "now.reserve.strong" : "now.reserve.test")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {reserve.total > reserve.items.length && <p className="text-[11px] text-ink-faint mt-2">{t("now.reserve.more", { n: reserve.total - reserve.items.length })}</p>}
            </div>
          </div>
        </div>

        <Tile openLabel={open} href={to.inventory} label={t("now.row.fill")} value={pct(cur.fillRate)} unit="pts" delta={pts(cur.fillRate, prior.fillRate)} />
        <Tile openLabel={open} href={to.overview} label={t("now.row.rawRate")} value={pct(cur.rawRate)} unit="pts" delta={pts(cur.rawRate, prior.rawRate)} />
        <Tile openLabel={open} href={to.price} label={t("now.row.avgPrice")} value={usd2(cur.avgPrice)} delta={rel(cur.avgPrice, prior.avgPrice)} />
        <Tile openLabel={open} href={to.overview} label={t("now.row.revenue")} value={usd(cur.revenue)} delta={rel(cur.revenue, prior.revenue)} />
        <Tile openLabel={open} href={to.overview} label={t("now.row.waitlist")} value={num(cur.waitlist)} delta={rel(cur.waitlist, prior.waitlist)} />
        <Tile openLabel={open} href={to.overview} label={t("now.row.dropped")} value={num(cur.dropped)} delta={rel(cur.dropped, prior.dropped)} invert />
      </div>
    </div>
  );
}
