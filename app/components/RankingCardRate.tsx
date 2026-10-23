"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import RankRowView, { RankGrid } from "./RankRowView";
import { getRankingDetail } from "../lib/actions/rankingDetail";
import type { RankingDetail } from "../lib/db/rankingDetail";
import { isPriority, isSmallSample, isWorse } from "../lib/rankingFlags";
import type { Locale } from "@/i18n/config";

// Ranking de tasa de cancelación: lista con barra (formato A) con la marca del promedio de la red, filtros rápidos
// (Prioridad, Empeoraron, Muestra chica) y detalle por fila que se carga al desplegarla (tendencia y motivos).

type T = (key: string, values?: Record<string, string | number>) => string;
export type RateRow = { facilityId: string; label: string; href: string; rate: number; games: number; priorRate: number | null; rankChange?: number | null };
type Filter = "all" | "priority" | "worse" | "small";
type Entry = { status: "loading" } | { status: "error" } | { status: "ok"; data: RankingDetail };

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Spark({ trend, networkRate, label }: { trend: { label: string; rate: number }[]; networkRate: number; label: string }) {
  const W = 190, H = 56;
  if (trend.length < 2) return <div className="text-xs text-ink-faint">—</div>;
  const x = (i: number) => 6 + (i * (W - 12)) / (trend.length - 1);
  const top = Math.max(0.01, ...trend.map((p) => p.rate), networkRate) * 1.1;
  const y = (v: number) => H - 8 - (v / top) * (H - 16);
  const last = trend[trend.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} className="max-w-full">
      <line x1="6" x2={W - 6} y1={y(networkRate)} y2={y(networkRate)} style={{ stroke: "var(--c-rank-ref)" }} strokeDasharray="1.5 4" strokeLinecap="round" strokeWidth="2" />
      <polyline points={trend.map((p, i) => `${x(i)},${y(p.rate)}`).join(" ")} fill="none" style={{ stroke: "var(--c-series-negative)" }} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(trend.length - 1)} cy={y(last.rate)} r="4" style={{ fill: "var(--c-series-negative)", stroke: "var(--c-chart-point-ring)" }} strokeWidth="2" />
    </svg>
  );
}

export default function RankingCardRate({
  title, subtitle, rows, networkRate, detail,
}: {
  title: string;
  subtitle?: string;
  rows: RateRow[];
  networkRate: number;
  detail: { from: string; to: string; unit: "week" | "month"; windowStart: string; windowEnd: string; locale: Locale };
}) {
  const t = useTranslations("Overview.rankings.rate") as unknown as T;
  const uid = useId();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, Entry>>({});

  const inputs = useMemo(() => rows.map((r) => ({ r, f: { rate: r.rate, games: r.games, priorRate: r.priorRate } })), [rows]);
  const tests: Record<Filter, (f: { rate: number; games: number; priorRate: number | null }) => boolean> = { all: () => true, priority: isPriority, worse: isWorse, small: isSmallSample };
  const count = (k: Filter) => inputs.filter((i) => tests[k](i.f)).length;
  const shown = inputs.map((i, idx) => ({ ...i, idx })).filter((i) => tests[filter](i.f));

  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) { next.delete(id); setOpen(next); return; }
    next.add(id); setOpen(next);
    if (!details[id]) {
      setDetails((d) => ({ ...d, [id]: { status: "loading" } }));
      getRankingDetail({ facilityId: id, ...detail })
        .then((data) => setDetails((d) => ({ ...d, [id]: data ? { status: "ok", data } : { status: "error" } })))
        .catch(() => setDetails((d) => ({ ...d, [id]: { status: "error" } })));
    }
  };

  const chip = (k: Filter, label: string) => (
    <button
      key={k}
      type="button"
      aria-pressed={filter === k}
      onClick={() => setFilter(k)}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${filter === k ? "bg-ink text-surface border-ink" : "border-border text-ink-muted hover:text-ink"}`}
    >
      {label}<span className="ml-1.5 opacity-70 font-semibold">{count(k)}</span>
    </button>
  );

  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
      <h3 className="text-sm font-medium text-ink mb-0.5">{title}</h3>
      {subtitle && <p className="text-xs text-ink-faint mb-3">{subtitle}</p>}
      {rows.length === 0 ? (
        <div className="text-sm text-ink-faint">{t("noData")}</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label={t("filters.label")}>
            {chip("all", t("filters.all"))}{chip("priority", t("filters.priority"))}{chip("worse", t("filters.worse"))}{chip("small", t("filters.small"))}
          </div>
          {shown.length === 0 ? (
            <div className="rounded-xl bg-surface-sunken py-6 text-center text-sm text-ink-faint">{t("empty")}</div>
          ) : (
            <RankGrid expandable>
              {shown.map(({ r, f, idx }) => {
                const isOpen = open.has(r.facilityId);
                const entry = details[r.facilityId];
                const panelId = `${uid}-${r.facilityId}`;
                return (
                  <div key={r.facilityId} className="col-span-full grid grid-cols-subgrid gap-y-1.5">
                    <RankRowView
                      rank={idx + 1}
                      label={r.label}
                      valueText={pct(r.rate)}
                      extra={t("games", { n: r.games })}
                      rankChange={r.rankChange}
                      fraction={r.rate}
                      tone="danger"
                      marker={networkRate}
                      markerTitle={t("refTitle", { rate: pct(networkRate) })}
                      small={isSmallSample(f)}
                      expandable
                      expanded={isOpen}
                      controls={panelId}
                      onClick={() => toggle(r.facilityId)}
                    />
                    {isOpen && (
                      <div id={panelId} className="col-span-full rounded-xl border border-border bg-surface-sunken px-4 py-3.5 grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] items-center">
                        {!entry || entry.status === "loading" ? (
                          <div className="col-span-full text-xs text-ink-faint">{t("loading")}</div>
                        ) : entry.status === "error" ? (
                          <div className="col-span-full text-xs text-danger">{t("error")}</div>
                        ) : (
                          <>
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint mb-1">{t("detail.trend", { n: entry.data.trend.length })}</div>
                              <Spark trend={entry.data.trend} networkRate={networkRate} label={t("detail.trendAria")} />
                              <div className="text-xs text-ink-muted mt-0.5">
                                {r.priorRate === null ? t("detail.noPrior") : t("detail.vsPrior", { pts: `${r.rate >= r.priorRate ? "+" : "−"}${Math.abs(Math.round((r.rate - r.priorRate) * 100))}` })}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint mb-1">{t("detail.why")}</div>
                              {entry.data.reasons.length === 0 ? (
                                <div className="text-xs text-ink-faint">{t("detail.noReasons")}</div>
                              ) : (
                                <div className="space-y-1">
                                  {entry.data.reasons.slice(0, 4).map((x) => (
                                    <div key={x.label} className="grid grid-cols-[minmax(0,1fr)_88px_34px] gap-2 items-center text-xs">
                                      <span className="truncate text-ink">{x.label}{!x.countsInRate && <span className="text-ink-faint"> · {t("detail.notInRate")}</span>}</span>
                                      <span className="h-2 rounded-full bg-surface-panel overflow-hidden"><i className={`block h-full rounded-full ${x.countsInRate ? "rank-band-danger" : "bg-ink-faint/30"}`} style={{ width: `${x.pct * 100}%`, ...(x.countsInRate ? { background: "linear-gradient(90deg, rgb(220 38 38 / .55), rgb(220 38 38 / .85))" } : {}) }} /></span>
                                      <b className="text-right text-ink">{pct(x.pct)}</b>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <Link href={r.href} className="justify-self-start sm:justify-self-end rounded-lg border border-border px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-panel whitespace-nowrap">{t("detail.open")} ›</Link>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </RankGrid>
          )}
        </>
      )}
    </div>
  );
}
