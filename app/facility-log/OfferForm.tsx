"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { declareFacilityOffer } from "../lib/actions/facilityOffer";
import { OFFER_MODALITIES, type OfferModality } from "../lib/facilityOffer";

const inputClass =
  "w-full rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink placeholder:text-ink-faint ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-brand/40 hover:ring-border-strong transition-colors";
const labelClass = "block text-xs font-medium text-ink-muted mb-1";

export default function OfferForm({ facilityId, current }: { facilityId: string; current: OfferModality | null }) {
  const t = useTranslations("FacilityLog.offer");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [modality, setModality] = useState<OfferModality | "">(current ?? "");
  const [others, setOthers] = useState<"" | "yes" | "no">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-surface px-3.5 py-1.5 text-sm font-medium text-ink shadow-sm hover:shadow-md transition-shadow">
        {current ? t("update") : t("declare")}
      </button>
    );
  }

  function submit() {
    if (!modality) return;
    setError(null);
    startTransition(async () => {
      const r = await declareFacilityOffer({ facilityId, modality, otherOrganizers: others === "" ? null : others === "yes", note });
      if (r.ok) {
        setOpen(false);
        setNote("");
        router.refresh();
      } else {
        setError(t(`errors.${r.errorKey}`));
      }
    });
  }

  return (
    <div className="space-y-3 rounded-xl bg-surface-sunken p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{t("modalityLabel")}</label>
          <select className={inputClass} value={modality} onChange={(e) => setModality(e.target.value as OfferModality | "")}>
            <option value="">{t("choose")}</option>
            {OFFER_MODALITIES.map((m) => (
              <option key={m} value={m}>{t(`modalities.${m}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{t("othersLabel")}</label>
          <select className={inputClass} value={others} onChange={(e) => setOthers(e.target.value as "" | "yes" | "no")}>
            <option value="">{t("unknown")}</option>
            <option value="yes">{t("yes")}</option>
            <option value="no">{t("no")}</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelClass}>{t("noteLabel")}</label>
        <textarea className={inputClass} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} />
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending || !modality} onClick={submit} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/85 disabled:opacity-50 transition-colors">
          {t("save")}
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-full bg-surface px-3.5 py-2 text-sm font-medium text-ink shadow-sm disabled:opacity-50">
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
