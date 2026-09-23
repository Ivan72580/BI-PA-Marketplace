import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getDailyRiskFacilities } from "../lib/db/queries";
import { todayISO } from "../lib/period";
import ChangeBadge from "./ChangeBadge";
import Glossary from "./Glossary";

// Landing de /daily (sin facility elegida): recorre la red completa para
// sugerir por dónde empezar, algo que el resto de la página nunca hace (es
// exclusivamente por facility). Ver el comentario extenso en
// getDailyRiskFacilities (app/lib/db/daily.ts) para el criterio de ranking.
//
// Solo dos niveles de severidad (alto/medio), sin verde: esta lista ya viene
// pre-filtrada a facilities con una señal real de deterioro — no tiene
// sentido un semáforo en verde dentro de un listado de "para mirar primero".
export default async function DailyRiskFacilities({
  facilities,
  markets,
}: {
  facilities: { id: string; name: string; marketId: string }[];
  markets: { id: string; name: string; regionId: string }[];
}) {
  const [rows, t] = await Promise.all([
    getDailyRiskFacilities(todayISO()),
    getTranslations("Daily.riskFacilities"),
  ]);

  if (rows.length === 0) return null;

  const marketById = new Map(markets.map((m) => [m.id, m]));
  const facilityMarketById = new Map(facilities.map((f) => [f.id, f.marketId]));
  const maxCancelled = Math.max(...rows.map((r) => r.recentCancelledGames));

  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
      <h3 className="text-sm font-medium text-ink mb-0.5">{t("title")}</h3>
      <p className="text-xs text-ink-faint mb-4">{t("subtitle")}</p>

      <div className="space-y-3">
        {rows.map((r) => {
          const marketId = facilityMarketById.get(r.facilityId);
          const market = marketId ? marketById.get(marketId) : undefined;
          const href = market ? `/daily?regionId=${market.regionId}&marketId=${market.id}&facilityId=${r.facilityId}` : null;
          const barPct = maxCancelled > 0 ? (r.recentCancelledGames / maxCancelled) * 100 : 0;
          const barColor = r.severity === "high" ? "bg-danger" : "bg-warning";

          const row = (
            <div>
              <div className="flex items-center justify-between gap-2 text-xs mb-1">
                <span className="truncate text-ink font-medium">{r.facilityName}</span>
                <span className="flex items-center gap-2 shrink-0 text-ink-faint">
                  <span>{t("cancelledCount", { n: r.recentCancelledGames })}</span>
                  <ChangeBadge value={r.confirmationRateDelta} />
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-surface-sunken">
                <div className={`h-1.5 ${barColor}`} style={{ width: `${barPct}%` }} />
              </div>
            </div>
          );

          return href ? (
            <Link key={r.facilityId} href={href} className="block rounded-lg -mx-1.5 px-1.5 py-0.5 hover:bg-brand-soft/40 transition-colors">
              {row}
            </Link>
          ) : (
            <div key={r.facilityId}>{row}</div>
          );
        })}
      </div>

      <Glossary
        items={[
          { term: t("glossary.window.term"), def: t("glossary.window.def") },
          { term: t("glossary.delta.term"), def: t("glossary.delta.def") },
          { term: t("glossary.severity.term"), def: t("glossary.severity.def") },
        ]}
      />
    </div>
  );
}
