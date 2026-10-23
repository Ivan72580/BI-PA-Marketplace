import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getDailyRiskFacilities } from "../lib/db/queries";
import { todayISO } from "../lib/period";
import FacilitySearch from "./FacilitySearch";
import ChangeBadge from "./ChangeBadge";
import PageHeader from "./PageHeader";

// Entrada del análisis de facility (/facility sin facility elegida). Tres caminos, del más rápido al más lento:
// buscar por nombre, abrir una de las que conviene mirar primero, o recorrer región → market → facility.

type Option = { id: string; name: string };
type Market = Option & { regionId: string };
type Facility = Option & { marketId: string };

const chip = (active: boolean) => `rounded-full px-3 py-1.5 text-sm transition-colors ${active ? "bg-brand-fill text-white font-semibold" : "bg-surface text-ink-muted hover:text-ink shadow-sm"}`;

export default async function Facility360Landing({
  sp,
  regions,
  markets,
  facilities,
}: {
  sp: { regionId?: string; marketId?: string; date?: string };
  regions: Option[];
  markets: Market[];
  facilities: Facility[];
}) {
  const [t, risk] = await Promise.all([getTranslations("Facility360.landing"), getDailyRiskFacilities(todayISO())]);
  const marketById = new Map(markets.map((m) => [m.id, m]));
  const regionMarkets = sp.regionId ? markets.filter((m) => m.regionId === sp.regionId) : [];
  const marketFacilities = sp.marketId ? facilities.filter((f) => f.marketId === sp.marketId) : [];
  const facilityHref = (id: string) => `/facility?${new URLSearchParams({ facilityId: id, ...(sp.date ? { date: sp.date } : {}) }).toString()}`;
  const zoneHref = (o: { regionId?: string; marketId?: string }) => {
    const p = new URLSearchParams();
    if (o.regionId) p.set("regionId", o.regionId);
    if (o.marketId) p.set("marketId", o.marketId);
    const qs = p.toString();
    return qs ? `/facility?${qs}` : "/facility";
  };
  const facilitiesIn = (marketId: string) => facilities.filter((f) => f.marketId === marketId).length;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="rounded-2xl bg-surface shadow-sm px-5 py-5">
        <div className="text-sm font-semibold text-ink mb-2">{t("searchTitle")}</div>
        <FacilitySearch
          facilities={facilities}
          markets={markets}
          variant="panel"
          autoFocus
          placeholder={t("searchPlaceholder")}
          emptyMessageTemplate={t("searchEmpty", { query: "{query}" })}
          basePath="/facility"
          extraParams={{ date: sp.date }}
        />
      </div>

      {risk.length > 0 && (
        <section>
          <h2 className="font-display text-base font-bold text-ink">{t("reviewTitle")}</h2>
          <p className="text-xs text-ink-faint mb-3">{t("reviewSub")}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {risk.slice(0, 8).map((r) => (
              <Link key={r.facilityId} href={facilityHref(r.facilityId)} className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-4 block">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${r.severity === "high" ? "bg-danger-fill" : "bg-warning-fill"}`} aria-hidden="true" />
                  <span className="text-sm font-semibold text-ink truncate">{r.facilityName}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-2 text-xs text-ink-muted">
                  <span>{t("cancelledCount", { n: r.recentCancelledGames })}</span>
                  <ChangeBadge value={r.confirmationRateDelta} unit="pts" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-base font-bold text-ink mb-3">{t("browseTitle")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={zoneHref({})} className={chip(!sp.regionId)}>{t("allRegions")}</Link>
          {regions.map((r) => (
            <Link key={r.id} href={zoneHref({ regionId: r.id })} className={chip(sp.regionId === r.id)}>{r.name}</Link>
          ))}
        </div>

        {sp.regionId && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {regionMarkets.map((m) => (
              <Link key={m.id} href={zoneHref({ regionId: sp.regionId, marketId: m.id })} className={chip(sp.marketId === m.id)}>
                {m.name} <span className="opacity-70 text-xs">· {facilitiesIn(m.id)}</span>
              </Link>
            ))}
          </div>
        )}

        {sp.marketId && marketById.has(sp.marketId) && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
            {marketFacilities.map((f) => (
              <Link key={f.id} href={facilityHref(f.id)} className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-4 text-sm font-medium text-brand block truncate">
                {f.name} →
              </Link>
            ))}
            {marketFacilities.length === 0 && <div className="text-sm text-ink-faint">{t("empty")}</div>}
          </div>
        )}
        {!sp.regionId && <p className="text-xs text-ink-faint mt-3">{t("pickRegionHint")}</p>}
        {sp.regionId && !sp.marketId && <p className="text-xs text-ink-faint mt-3">{t("pickMarketHint")}</p>}
      </section>
    </div>
  );
}
