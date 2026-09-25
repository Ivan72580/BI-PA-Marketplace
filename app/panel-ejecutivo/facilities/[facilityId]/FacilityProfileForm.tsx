"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  saveFacilityProfile,
  savePeakWindows,
  type FacilityProfileInput,
  type PeakWindowInput,
} from "../../../lib/actions/facilityProfile";

type Props = {
  facilityId: string;
  initial: FacilityProfileInput;
  initialPeakWindows: PeakWindowInput[];
};

const AMENITIES = [
  "PARKING",
  "LOCKER_ROOMS",
  "SHOWERS",
  "CAFETERIA_BAR",
  "WIFI",
  "PRO_SHOP",
  "SPECTATOR_SEATING",
  "AIR_CONDITIONING",
  "FIRST_AID",
  "SECURITY_CAMERAS",
  "NIGHT_LIGHTING",
] as const;
const INDOOR_OUTDOOR = ["INDOOR", "OUTDOOR", "MIXED"] as const;
const PRICING_MODELS = ["FIXED_RATE", "REVENUE_SHARE", "HYBRID"] as const;
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const inputClass =
  "w-full rounded-md border border-border bg-surface/60 px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand/30 hover:border-border-strong transition-colors";
const labelClass = "block text-xs text-ink-faint mb-1";

export default function FacilityProfileForm({ facilityId, initial, initialPeakWindows }: Props) {
  const t = useTranslations("FacilityProfile");
  const [form, setForm] = useState<FacilityProfileInput>(initial);
  const [peakWindows, setPeakWindows] = useState<PeakWindowInput[]>(initialPeakWindows);
  const [newFormat, setNewFormat] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function set<K extends keyof FacilityProfileInput>(key: K, value: FacilityProfileInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleAmenity(a: (typeof AMENITIES)[number]) {
    setForm((prev) => {
      const has = prev.amenities.includes(a);
      return { ...prev, amenities: has ? prev.amenities.filter((x) => x !== a) : [...prev.amenities, a] };
    });
  }

  function addFormat() {
    const value = newFormat.trim();
    if (!value || form.supportedFormats.includes(value)) {
      setNewFormat("");
      return;
    }
    set("supportedFormats", [...form.supportedFormats, value]);
    setNewFormat("");
  }

  function removeFormat(value: string) {
    set("supportedFormats", form.supportedFormats.filter((f) => f !== value));
  }

  function addPeakWindow() {
    setPeakWindows((prev) => [...prev, { dayOfWeek: 1, startHour: 17, endHour: 22 }]);
  }
  function removePeakWindow(idx: number) {
    setPeakWindows((prev) => prev.filter((_, i) => i !== idx));
  }
  function updatePeakWindow(idx: number, patch: Partial<PeakWindowInput>) {
    setPeakWindows((prev) => prev.map((w, i) => (i === idx ? { ...w, ...patch } : w)));
  }

  function handleSave() {
    setFeedback(null);
    startTransition(async () => {
      const [profileResult, windowsResult] = await Promise.all([
        saveFacilityProfile(facilityId, form),
        savePeakWindows(facilityId, peakWindows),
      ]);
      if (profileResult.ok && windowsResult.ok) {
        setFeedback({ type: "ok", text: t("saved") });
      } else {
        const errorKey = !profileResult.ok ? profileResult.errorKey : !windowsResult.ok ? windowsResult.errorKey : "generic";
        setFeedback({ type: "error", text: t(`errors.${errorKey}`) });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Datos básicos */}
      <section className="rounded-2xl bg-surface shadow-sm p-5">
        <h2 className="font-display text-base font-semibold text-ink mb-4">{t("sections.basics")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>{t("fields.city")}</label>
            <input className={inputClass} value={form.city ?? ""} onChange={(e) => set("city", e.target.value || null)} />
          </div>
          <div>
            <label className={labelClass}>{t("fields.state")}</label>
            <input className={inputClass} value={form.state ?? ""} onChange={(e) => set("state", e.target.value || null)} />
          </div>
          <div>
            <label className={labelClass}>{t("fields.fieldCount")}</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.fieldCount ?? ""}
              onChange={(e) => set("fieldCount", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>{t("fields.indoorOutdoor")}</label>
            <select
              className={inputClass}
              value={form.indoorOutdoor ?? ""}
              onChange={(e) => set("indoorOutdoor", (e.target.value || null) as FacilityProfileInput["indoorOutdoor"])}
            >
              <option value="">—</option>
              {INDOOR_OUTDOOR.map((v) => (
                <option key={v} value={v}>{t(`indoorOutdoor.${v}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t("fields.marketRate")}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              value={form.marketRate ?? ""}
              onChange={(e) => set("marketRate", e.target.value === "" ? null : Number(e.target.value))}
            />
            <p className="text-[11px] text-ink-faint mt-1">{t("fields.marketRateHint")}</p>
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>{t("fields.supportedFormats")}</label>
          <p className="text-[11px] text-ink-faint mb-1.5">{t("fields.supportedFormatsHint")}</p>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {form.supportedFormats.map((fmt) => (
              <span key={fmt} className="inline-flex items-center gap-1 rounded-full bg-brand-soft text-brand text-xs px-2.5 py-1">
                {fmt}
                <button type="button" onClick={() => removeFormat(fmt)} aria-label={t("fields.removeFormat")} className="hover:text-red-600">
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={inputClass}
              placeholder={t("fields.supportedFormatsPlaceholder")}
              value={newFormat}
              onChange={(e) => setNewFormat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFormat();
                }
              }}
            />
            <button type="button" onClick={addFormat} className="text-xs text-brand hover:underline whitespace-nowrap">
              {t("fields.addFormat")}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>{t("fields.amenities")}</label>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {AMENITIES.map((a) => (
              <label key={a} className="flex items-center gap-1.5 text-sm text-ink-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.amenities.includes(a)}
                  onChange={() => toggleAmenity(a)}
                  className="rounded border-border text-brand"
                />
                {t(`amenity.${a}`)}
              </label>
            ))}
          </div>
          <input
            className={`${inputClass} mt-2`}
            placeholder={t("fields.amenitiesOtherPlaceholder")}
            value={form.amenitiesOther ?? ""}
            onChange={(e) => set("amenitiesOther", e.target.value || null)}
          />
        </div>
      </section>

      {/* Relación */}
      <section className="rounded-2xl bg-surface shadow-sm p-5">
        <h2 className="font-display text-base font-semibold text-ink mb-4">{t("sections.relationship")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>{t("fields.partnershipStartDate")}</label>
            <input
              type="date"
              className={inputClass}
              value={form.partnershipStartDate ?? ""}
              onChange={(e) => set("partnershipStartDate", e.target.value || null)}
            />
          </div>
          <div>
            <label className={labelClass}>{t("fields.contactName")}</label>
            <input className={inputClass} value={form.contactName ?? ""} onChange={(e) => set("contactName", e.target.value || null)} />
          </div>
          <div>
            <label className={labelClass}>{t("fields.contactEmail")}</label>
            <input
              type="email"
              className={inputClass}
              value={form.contactEmail ?? ""}
              onChange={(e) => set("contactEmail", e.target.value || null)}
            />
          </div>
          <div>
            <label className={labelClass}>{t("fields.contactPhone")}</label>
            <input className={inputClass} value={form.contactPhone ?? ""} onChange={(e) => set("contactPhone", e.target.value || null)} />
          </div>
          <div>
            <label className={labelClass}>{t("fields.depositAmount")}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              value={form.depositAmount ?? ""}
              onChange={(e) => set("depositAmount", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>{t("fields.depositNotes")}</label>
            <input className={inputClass} value={form.depositNotes ?? ""} onChange={(e) => set("depositNotes", e.target.value || null)} />
          </div>
        </div>

        <p className="text-[11px] text-ink-faint mt-4 mb-2">{t("fields.termsHint")}</p>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>{t("fields.paymentTerms")}</label>
            <textarea rows={3} className={inputClass} value={form.paymentTerms ?? ""} onChange={(e) => set("paymentTerms", e.target.value || null)} />
          </div>
          <div>
            <label className={labelClass}>{t("fields.bookingTerms")}</label>
            <textarea rows={3} className={inputClass} value={form.bookingTerms ?? ""} onChange={(e) => set("bookingTerms", e.target.value || null)} />
          </div>
          <div>
            <label className={labelClass}>{t("fields.cancellationTerms")}</label>
            <textarea
              rows={3}
              className={inputClass}
              value={form.cancellationTerms ?? ""}
              onChange={(e) => set("cancellationTerms", e.target.value || null)}
            />
          </div>
        </div>
      </section>

      {/* Comercial */}
      <section className="rounded-2xl bg-surface shadow-sm p-5">
        <h2 className="font-display text-base font-semibold text-ink mb-1">{t("sections.commercial")}</h2>
        <p className="text-[11px] text-ink-faint mb-4">{t("sections.commercialHint")}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>{t("fields.pricingModel")}</label>
            <select
              className={inputClass}
              value={form.pricingModel ?? ""}
              onChange={(e) => set("pricingModel", (e.target.value || null) as FacilityProfileInput["pricingModel"])}
            >
              <option value="">—</option>
              {PRICING_MODELS.map((v) => (
                <option key={v} value={v}>{t(`pricingModel.${v}`)}</option>
              ))}
            </select>
          </div>
          {(form.pricingModel === "FIXED_RATE" || form.pricingModel === "HYBRID") && (
            <div>
              <label className={labelClass}>{t("fields.fixedRate")}</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                value={form.fixedRate ?? ""}
                onChange={(e) => set("fixedRate", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          )}
          {(form.pricingModel === "REVENUE_SHARE" || form.pricingModel === "HYBRID") && (
            <div>
              <label className={labelClass}>{t("fields.revenueSharePct")}</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                className={inputClass}
                value={form.revenueSharePct ?? ""}
                onChange={(e) => set("revenueSharePct", e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>{t("fields.discountAmount")}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              value={form.discountAmount ?? ""}
              onChange={(e) => set("discountAmount", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>{t("fields.discountPct")}</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              className={inputClass}
              value={form.discountPct ?? ""}
              onChange={(e) => set("discountPct", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>{t("fields.freeHoursPerMonth")}</label>
            <input
              type="number"
              min={0}
              step="0.5"
              className={inputClass}
              value={form.freeHoursPerMonth ?? ""}
              onChange={(e) => set("freeHoursPerMonth", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      {/* Peak hours */}
      <section className="rounded-2xl bg-surface shadow-sm p-5">
        <h2 className="font-display text-base font-semibold text-ink mb-1">{t("peakWindows.title")}</h2>
        <p className="text-[11px] text-ink-faint mb-4">{t("peakWindows.hint")}</p>
        <div className="space-y-2">
          {peakWindows.map((w, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                className={inputClass}
                style={{ maxWidth: 140 }}
                value={w.dayOfWeek}
                onChange={(e) => updatePeakWindow(idx, { dayOfWeek: Number(e.target.value) })}
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>{t(`peakWindows.days.${d}`)}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                max={23}
                className={inputClass}
                style={{ maxWidth: 90 }}
                value={w.startHour}
                onChange={(e) => updatePeakWindow(idx, { startHour: Number(e.target.value) })}
              />
              <span className="text-ink-faint text-xs">{t("peakWindows.to")}</span>
              <input
                type="number"
                min={1}
                max={24}
                className={inputClass}
                style={{ maxWidth: 90 }}
                value={w.endHour}
                onChange={(e) => updatePeakWindow(idx, { endHour: Number(e.target.value) })}
              />
              <button type="button" onClick={() => removePeakWindow(idx)} className="text-xs text-ink-faint hover:text-red-600">
                {t("peakWindows.remove")}
              </button>
            </div>
          ))}
          {peakWindows.length === 0 && <p className="text-xs text-ink-faint">{t("peakWindows.empty")}</p>}
        </div>
        <button type="button" onClick={addPeakWindow} className="text-xs text-brand hover:underline mt-3">
          {t("peakWindows.add")}
        </button>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={handleSave}
          className="rounded-md bg-brand text-white text-sm font-medium px-4 py-2 hover:bg-brand/90 disabled:opacity-50"
        >
          {isPending ? t("saving") : t("save")}
        </button>
        {feedback && (
          <span className={feedback.type === "error" ? "text-xs text-red-600" : "text-xs text-ink-faint"}>{feedback.text}</span>
        )}
      </div>
    </div>
  );
}
