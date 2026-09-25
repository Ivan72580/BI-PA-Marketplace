import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getFacilityProfileDetail } from "../../../lib/db/queries";
import type { FacilityProfileInput, PeakWindowInput } from "../../../lib/actions/facilityProfile";
import FacilityProfileForm from "./FacilityProfileForm";
import RelationshipHistoryPanel from "./RelationshipHistoryPanel";

function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function FacilityProfileDetailPage({
  params,
}: {
  params: Promise<{ facilityId: string }>;
}) {
  const { facilityId } = await params;

  // El chequeo de acceso ahora vive una sola vez en layout.tsx.
  const [detail, t] = await Promise.all([getFacilityProfileDetail(facilityId), getTranslations("FacilityProfile")]);
  if (!detail) notFound();

  const { facility, profile, stats } = detail;

  // Valores iniciales del form — si todavía no hay perfil (facility nunca
  // editado), todo arranca vacío/default en vez de null para simplificar el
  // estado controlado de los inputs.
  const initial: FacilityProfileInput = {
    city: profile?.city ?? null,
    state: profile?.state ?? null,
    fieldCount: profile?.fieldCount ?? null,
    supportedFormats: profile?.supportedFormats ?? [],
    indoorOutdoor: profile?.indoorOutdoor ?? null,
    amenities: profile?.amenities ?? [],
    amenitiesOther: profile?.amenitiesOther ?? null,
    marketRate: profile?.marketRate ?? null,
    partnershipStartDate: profile?.partnershipStartDate ? profile.partnershipStartDate.toISOString().slice(0, 10) : null,
    contactName: profile?.contactName ?? null,
    contactEmail: profile?.contactEmail ?? null,
    contactPhone: profile?.contactPhone ?? null,
    paymentTerms: profile?.paymentTerms ?? null,
    bookingTerms: profile?.bookingTerms ?? null,
    cancellationTerms: profile?.cancellationTerms ?? null,
    depositAmount: profile?.depositAmount ?? null,
    depositNotes: profile?.depositNotes ?? null,
    pricingModel: profile?.pricingModel ?? null,
    fixedRate: profile?.fixedRate ?? null,
    revenueSharePct: profile?.revenueSharePct ?? null,
    discountAmount: profile?.discountAmount ?? null,
    discountPct: profile?.discountPct ?? null,
    freeHoursPerMonth: profile?.freeHoursPerMonth ?? null,
  };

  const initialPeakWindows: PeakWindowInput[] =
    profile?.peakWindows.map((w) => ({ dayOfWeek: w.dayOfWeek, startHour: w.startHour, endHour: w.endHour })) ?? [];

  const events =
    profile?.events.map((e) => ({
      id: e.id,
      type: e.type,
      date: e.date.toISOString().slice(0, 10),
      note: e.note,
      status: e.status,
      attachmentUrl: e.attachmentUrl,
    })) ?? [];

  return (
    <div>
      <div className="mb-5">
        <Link href="/panel-ejecutivo/facilities" className="text-xs text-ink-faint hover:text-brand">
          {t("backToList")}
        </Link>
      </div>

      <div className="mb-6 pb-5 border-b border-border">
        <h1 className="font-display text-2xl font-bold text-ink">{facility.name}</h1>
        <div className="text-sm text-ink-faint mt-1">
          {facility.marketName} · {facility.regionName}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl bg-surface shadow-sm p-4">
          <div className="text-xs text-ink-faint">{t("history.gamesHosted")}</div>
          <div className="font-display text-xl font-semibold text-ink mt-1">{stats.gamesHosted.toLocaleString("en-US")}</div>
        </div>
        <div className="rounded-2xl bg-surface shadow-sm p-4">
          <div className="text-xs text-ink-faint">{t("history.revenueGenerated")}</div>
          <div className="font-display text-xl font-semibold text-ink mt-1">{formatUSD(stats.revenueGenerated)}</div>
        </div>
      </div>

      <FacilityProfileForm facilityId={facilityId} initial={initial} initialPeakWindows={initialPeakWindows} />

      <div className="mt-6">
        <RelationshipHistoryPanel facilityId={facilityId} initialEvents={events} />
      </div>
    </div>
  );
}
