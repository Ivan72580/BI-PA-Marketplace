import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getFacilityDeep, getFacilityTable, getFacilityContext, type FacilityTableRow } from "../lib/db/queries";
import GroupSection from "./GroupSection";
import StatStrip, { type Stat } from "./StatStrip";

// Capa 7: Posición. Dónde está la facility dentro de su market en los últimos 90 días: peso (market share),
// ranking, demanda contra el promedio del market, cancha no disponible, reputación y precio.

type T = (key: string, values?: Record<string, string | number>) => string;
const MIN_RATING_COUNT = 3; // reviews mínimas para entrar al ranking de reputación
const MIN_PUBLISHED = 10; // publicados mínimos para entrar a rankings de tasas
const pct = (n: number | null, d = 0) => (n === null ? "—" : `${(n * 100).toFixed(d)}%`);
const usd2 = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }));

function rankOf(rows: FacilityTableRow[], id: string, value: (r: FacilityTableRow) => number | null, desc: boolean): { rank: number; of: number } | null {
  const ranked = rows.map((r) => ({ id: r.facilityId, v: value(r) })).filter((x): x is { id: string; v: number } => x.v !== null);
  if (!ranked.some((x) => x.id === id)) return null;
  ranked.sort((a, b) => (desc ? b.v - a.v : a.v - b.v));
  return { rank: ranked.findIndex((x) => x.id === id) + 1, of: ranked.length };
}

export default async function Facility360Position({ facilityId, date }: { facilityId: string; date?: string }) {
  const [tr, deep] = await Promise.all([getTranslations("Facility360"), getFacilityDeep(facilityId, date)]);
  if (!deep) return null;
  const t = tr as unknown as T;
  const w = deep.windows.cur;
  const ctx = await getFacilityContext(facilityId);
  if (!ctx) return null;
  const rows = await getFacilityTable({ marketId: ctx.marketId, dateFrom: new Date(`${w.from}T00:00:00Z`), dateTo: new Date(`${w.to}T23:59:59Z`) });
  const me = rows.find((r) => r.facilityId === facilityId);
  const body = !me ? (
    <p className="text-sm text-ink-faint">{t("position.none")}</p>
  ) : (() => {
    const total = rows.reduce((s, r) => s + r.totalGames, 0);
    const confirmedTotal = rows.reduce((s, r) => s + r.confirmedGames, 0);
    const eligible = rows.filter((r) => r.totalGames >= MIN_PUBLISHED);
    const wAvg = (f: (r: FacilityTableRow) => number) => (total > 0 ? rows.reduce((s, r) => s + f(r) * r.totalGames, 0) / total : null);
    const mktDemand = wAvg((r) => r.confirmationRate);
    const priced = rows.filter((r) => r.avgPrice !== null);
    const pricedGames = priced.reduce((s, r) => s + r.totalGames, 0);
    const mktPrice = pricedGames > 0 ? priced.reduce((s, r) => s + (r.avgPrice ?? 0) * r.totalGames, 0) / pricedGames : null;
    const mktField = wAvg((r) => r.fieldUnavailableRate);
    const byConf = rankOf(rows, facilityId, (r) => r.confirmedGames, true);
    const byDemand = rankOf(eligible, facilityId, (r) => r.confirmationRate, true);
    const byField = rankOf(eligible, facilityId, (r) => r.fieldUnavailableRate, false);
    const byRating = rankOf(rows.filter((r) => r.ratingCount >= MIN_RATING_COUNT), facilityId, (r) => r.avgRating, true);
    const mine = { demand: me.confirmationRate, field: me.fieldUnavailableRate };
    const stats: Stat[] = [
      { label: t("position.share"), value: pct(total > 0 ? me.totalGames / total : null, 1), sub: t("position.shareSub", { pct: pct(confirmedTotal > 0 ? me.confirmedGames / confirmedTotal : null, 1), market: ctx.marketName }) },
      { label: t("position.rankConfirmed"), value: byConf ? `#${byConf.rank} / ${byConf.of}` : "—", sub: t("position.rankSub", { n: me.confirmedGames }) },
      { label: t("position.demandVsMarket"), value: pct(mine.demand), sub: mktDemand !== null ? t("position.vs", { market: pct(mktDemand), diff: `${mine.demand - mktDemand >= 0 ? "+" : ""}${((mine.demand - mktDemand) * 100).toFixed(0)}` }) : undefined, tone: mktDemand !== null ? (mine.demand - mktDemand >= 0.02 ? "good" : mine.demand - mktDemand <= -0.02 ? "bad" : "default") : "default" },
      { label: t("position.fieldVsMarket"), value: pct(mine.field, 1), sub: mktField !== null ? t("position.vsField", { market: pct(mktField, 1) }) : undefined, tone: mktField !== null && mine.field > mktField + 0.01 ? "warn" : "default" },
      { label: t("position.rating"), value: me.avgRating !== null ? me.avgRating.toFixed(2) : "—", sub: me.ratingCount > 0 ? (byRating ? t("position.ratingRank", { rank: byRating.rank, of: byRating.of, n: me.ratingCount }) : t("position.ratingN", { n: me.ratingCount })) : t("position.noRating") },
      { label: t("position.price"), value: usd2(me.avgPrice), sub: t("position.priceSub", { market: usd2(mktPrice) }) },
    ];
    const top = [...rows].sort((a, b) => b.confirmedGames - a.confirmedGames).slice(0, 8);
    const topMax = Math.max(...top.map((r) => r.confirmedGames), 1);
    return (
      <>
        <StatStrip stats={stats} />
        <div className="rounded-2xl bg-surface shadow-sm p-5">
          <h3 className="text-sm font-medium text-ink">{t("position.rankingTitle", { market: ctx.marketName })}</h3>
          <p className="text-xs text-ink-muted mt-0.5">{t("position.rankingSub")}</p>
          <ul className="mt-3 space-y-1.5">
            {top.map((r, i) => {
              const isMe = r.facilityId === facilityId;
              return (
                <li key={r.facilityId} className={`grid grid-cols-[24px_minmax(100px,1fr)_2fr_auto] items-center gap-3 text-sm rounded-lg px-2 py-1 ${isMe ? "bg-brand-soft" : ""}`}>
                  <span className="text-ink-faint tabular-nums">{i + 1}</span>
                  {isMe ? <span className="font-semibold text-brand truncate">{r.name}</span> : <Link href={`/facility?facilityId=${r.facilityId}${date ? `&date=${date}` : ""}`} className="text-ink hover:text-brand truncate">{r.name}</Link>}
                  <span className="h-2.5 rounded-full bg-surface-sunken overflow-hidden"><span className={`block h-2.5 ${isMe ? "bg-brand" : "bg-ink-faint/50"}`} style={{ width: `${(r.confirmedGames / topMax) * 100}%` }} /></span>
                  <span className="text-right tabular-nums text-ink-muted"><span className="font-semibold text-ink">{r.confirmedGames}</span> · {pct(r.confirmationRate)}</span>
                </li>
              );
            })}
          </ul>
          {byDemand && byField && <p className="text-[11px] text-ink-faint mt-3">{t("position.rankFoot", { d: byDemand.rank, df: byDemand.of, f: byField.rank, ff: byField.of })}</p>}
        </div>
      </>
    );
  })();

  return (
    <div id="posicion" className="scroll-mt-[var(--layer-offset,10rem)]">
      <GroupSection title={t("nav.position")}>
        <p className="text-xs text-ink-muted max-w-3xl -mt-1">{t("position.note", { n: 90 })}</p>
        {body}
      </GroupSection>
    </div>
  );
}
