import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { getFacilityProfileDetail } from "../../lib/db/queries";
import { getFacilityInventory, type InventoryRow } from "../../lib/db/map";
import { getCurrentUser } from "../../lib/db/users";
import { DAY_ORDER, DAY_LABEL_ES } from "../../lib/db/shared";
import { resolvePeriod, todayISO, type Granularity, type ResolvedPeriod } from "../../lib/period";
import type { SP } from "../../lib/searchParams";
import type { Locale } from "@/i18n/config";
import FilterPanel from "../../components/FilterPanel";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(0)}%`);

// Los partidos se agendan entre ~6AM y ~3AM del día siguiente: las 00-05h van al final del día.
const hourKey = (time: string) => {
  const h = parseInt(time.slice(0, 2), 10);
  return (Number.isNaN(h) ? 99 : h < 6 ? h + 24 : h) * 100 + (parseInt(time.slice(3, 5), 10) || 0);
};

function resolve(sp: SP, locale: Locale, customLabel: string): ResolvedPeriod {
  const granularity = (sp.granularity as Granularity) || "month";
  if (granularity === "custom") {
    if (sp.customFrom && sp.customTo) {
      return { dateFrom: new Date(`${sp.customFrom}T00:00:00Z`), dateTo: new Date(`${sp.customTo}T23:59:59Z`), label: `${sp.customFrom} → ${sp.customTo}`, priorLabel: null };
    }
    return { label: customLabel, priorLabel: null };
  }
  return resolvePeriod(granularity, sp.period || todayISO(), undefined, undefined, locale);
}

export default async function MapFacilityPage({ params, searchParams }: { params: Promise<{ facilityId: string }>; searchParams: Promise<SP> }) {
  const [{ facilityId }, sp, rawLocale, t, user] = await Promise.all([params, searchParams, getLocale(), getTranslations("MapFacility"), getCurrentUser()]);
  const locale = rawLocale as Locale;
  const period = resolve(sp, locale, t("customRangeLabel"));

  const [detail, inventory] = await Promise.all([
    getFacilityProfileDetail(facilityId),
    getFacilityInventory({ facilityId, dateFrom: period.dateFrom, dateTo: period.dateTo }),
  ]);
  if (!detail) notFound();
  const { facility, profile } = detail;

  const rows: InventoryRow[] = [...inventory].sort((a, b) => {
    const f = (a.fieldName ?? "~").localeCompare(b.fieldName ?? "~", undefined, { numeric: true });
    if (f !== 0) return f;
    const d = DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek);
    return d !== 0 ? d : hourKey(a.time) - hourKey(b.time) || (a.gameSize ?? "").localeCompare(b.gameSize ?? "");
  });
  const totals = rows.reduce((s, r) => ({ confirmed: s.confirmed + r.confirmed, cancelled: s.cancelled + r.cancelled, revenue: s.revenue + r.revenue }), { confirmed: 0, cancelled: 0, revenue: 0 });
  const scheduled = totals.confirmed + totals.cancelled;
  const dayLabel = (d: string) => (locale === "es" ? (DAY_LABEL_ES[d] ?? d) : d.slice(0, 3));

  const query = new URLSearchParams();
  for (const k of ["granularity", "period", "customFrom", "customTo"] as const) if (sp[k]) query.set(k, sp[k]!);
  const qs = query.toString() ? `?${query.toString()}` : "";

  const unit = profile?.rateUnit ? t(`rateUnit.${profile.rateUnit}`) : null;
  const canEdit = Boolean(user?.canViewLeadership);
  const verified = profile?.ratesVerifiedAt ? profile.ratesVerifiedAt.toISOString().slice(0, 10) : null;

  return (
    <div>
      <div className="mb-4">
        <Link href={`/map${qs}`} className="text-xs text-ink-faint hover:text-brand">{t("back")}</Link>
      </div>

      <div className="mb-5 pb-4 border-b border-border">
        <h1 className="font-display text-2xl font-bold text-ink">{facility.name}</h1>
        <div className="text-sm text-ink-faint mt-1">
          {facility.marketName} · {facility.regionName}
          {profile?.address ? ` · ${profile.address}` : ""}
        </div>
      </div>

      <FilterPanel regions={[]} markets={[]} facilities={[]} showFacility={false} showGeo={false} hasFilter={false} clearHref={`/map/${facilityId}`} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-4">
        {[
          [t("published"), scheduled.toLocaleString("en-US")],
          [t("confirmed"), totals.confirmed.toLocaleString("en-US")],
          [t("confirmationRate"), pct(scheduled > 0 ? totals.confirmed / scheduled : null)],
          [t("revenue"), usd(totals.revenue)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-surface shadow-sm p-4">
            <div className="text-xs text-ink-faint">{label}</div>
            <div className="font-display text-xl font-semibold text-ink mt-1">{value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-2xl bg-surface shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-display text-base font-semibold text-ink">{t("terms.title")}</h2>
          <span className={`text-[11px] ${verified ? "text-ink-faint" : "text-warning"}`}>
            {verified ? t("terms.verifiedOn", { date: verified }) : t("terms.unverified")}
          </span>
        </div>
        {profile && (profile.pricingModel || profile.pricingRawText) ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-ink">
              {profile.pricingModel && <span><span className="text-ink-faint text-xs mr-1">{t("terms.model")}</span>{t(`pricingModel.${profile.pricingModel}`)}</span>}
              {profile.fixedRate !== null && <span><span className="text-ink-faint text-xs mr-1">{t("terms.rate")}</span>{usd2(profile.fixedRate)}{unit ? ` / ${unit}` : ""}</span>}
              {profile.revenueSharePct !== null && <span><span className="text-ink-faint text-xs mr-1">{t("terms.share")}</span>{profile.revenueSharePct}%</span>}
            </div>
            {profile.pricingRawText && (
              <details className="text-xs text-ink-muted">
                <summary className="cursor-pointer">{t("terms.original")}</summary>
                <pre className="whitespace-pre-wrap font-sans mt-1 text-ink-muted">{profile.pricingRawText}</pre>
              </details>
            )}
          </div>
        ) : (
          <div className="text-sm text-ink-faint">{t("terms.none")}</div>
        )}
        {canEdit && (
          <Link href={`/panel-ejecutivo/facilities/${facilityId}`} className="inline-block mt-3 text-xs text-brand">{t("terms.edit")}</Link>
        )}
      </section>

      <section className="rounded-2xl bg-surface shadow-sm p-5">
        <h2 className="font-display text-base font-semibold text-ink">{t("inventory.title")}</h2>
        <p className="text-xs text-ink-faint mb-3">{t("inventory.subtitle", { period: period.label })}</p>
        {rows.length === 0 ? (
          <div className="text-sm text-ink-faint py-4">{t("inventory.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-faint border-b border-border">
                  <th className="py-2 pr-3 font-medium">{t("inventory.field")}</th>
                  <th className="py-2 pr-3 font-medium">{t("inventory.day")}</th>
                  <th className="py-2 pr-3 font-medium">{t("inventory.time")}</th>
                  <th className="py-2 pr-3 font-medium">{t("inventory.format")}</th>
                  <th className="py-2 pr-3 font-medium text-right">{t("published")}</th>
                  <th className="py-2 pr-3 font-medium text-right">{t("confirmed")}</th>
                  <th className="py-2 pr-3 font-medium text-right">{t("inventory.cancelled")}</th>
                  <th className="py-2 pr-3 font-medium text-right">{t("confirmationRate")}</th>
                  <th className="py-2 pr-3 font-medium text-right">{t("inventory.avgPrice")}</th>
                  <th className="py-2 pr-3 font-medium text-right">{t("inventory.avgPlayers")}</th>
                  <th className="py-2 font-medium text-right">{t("revenue")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.fieldName}|${r.dayOfWeek}|${r.time}|${r.gameSize}`} className="border-b border-surface-sunken text-ink">
                    <td className="py-1.5 pr-3">{r.fieldName ?? <span className="text-ink-faint">{t("inventory.noField")}</span>}</td>
                    <td className="py-1.5 pr-3">{dayLabel(r.dayOfWeek)}</td>
                    <td className="py-1.5 pr-3">{r.time}</td>
                    <td className="py-1.5 pr-3">{r.gameSize ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right">{r.scheduled}</td>
                    <td className="py-1.5 pr-3 text-right">{r.confirmed}</td>
                    <td className="py-1.5 pr-3 text-right">{r.cancelled}</td>
                    <td className="py-1.5 pr-3 text-right">{pct(r.confirmationRate)}</td>
                    <td className="py-1.5 pr-3 text-right">{r.avgPrice === null ? "—" : usd2(r.avgPrice)}</td>
                    <td className="py-1.5 pr-3 text-right">{r.avgPlayers === null ? "—" : r.avgPlayers.toFixed(1)}</td>
                    <td className="py-1.5 text-right">{usd(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-ink-faint mt-3">{t("inventory.note")}</p>
      </section>
    </div>
  );
}
