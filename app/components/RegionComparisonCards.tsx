import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { RegionComparisonRow } from "../lib/db/queries";
import ChangeBadge from "./ChangeBadge";

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

// Solo 2 regiones en la red hoy (East/West) — por eso son 2 tarjetas lado a
// lado en vez de una tabla. Cada tarjeta lleva al detalle de esa región
// (mismo Overview, filtrado) — es el "a simple vista, cómo viene cada
// región" que faltaba: hoy esa comparación vive únicamente en Panel
// Ejecutivo/Leadership, sin filtro de período libre.
export default async function RegionComparisonCards({
  rows,
  buildHref,
}: {
  rows: RegionComparisonRow[];
  buildHref: (regionId: string) => string;
}) {
  const t = await getTranslations("Overview.regionComparison");
  if (rows.length < 2) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {rows.map((r) => (
        <Link
          key={r.regionId}
          href={buildHref(r.regionId)}
          className="block rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5 group"
        >
          <div className="text-sm font-medium text-ink group-hover:text-brand transition-colors mb-2">{r.regionName}</div>
          <div className="flex items-baseline gap-6 flex-wrap">
            <div>
              <div className="flex items-baseline gap-2">
                <div className="font-display text-2xl font-bold text-ink">{r.confirmedGames.toLocaleString("en-US")}</div>
                {r.changePct !== null && <ChangeBadge value={r.changePct} />}
              </div>
              <div className="text-[11px] text-ink-faint mt-0.5">{t("confirmedGames")}</div>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <div className="font-display text-2xl font-bold text-ink">{formatPct(r.confirmationRate)}</div>
                {r.changePts !== null && <ChangeBadge value={r.changePts} unit="pts" />}
              </div>
              <div className="text-[11px] text-ink-faint mt-0.5">{t("confirmationRate")}</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
