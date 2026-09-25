"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  addRelationshipEvent,
  deleteRelationshipEvent,
  updateRelationshipEventStatus,
  type RelationshipEventInput,
} from "../../../lib/actions/facilityProfile";

type EventRow = {
  id: string;
  type: RelationshipEventInput["type"];
  date: string;
  note: string;
  status: RelationshipEventInput["status"];
  attachmentUrl: string | null;
};

const EVENT_TYPES = ["EVENT", "AGREEMENT", "ACTION_ITEM"] as const;

const inputClass =
  "w-full rounded-md border border-border bg-surface/60 px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand/30 hover:border-border-strong transition-colors";
const labelClass = "block text-xs text-ink-faint mb-1";

export default function RelationshipHistoryPanel({
  facilityId,
  initialEvents,
}: {
  facilityId: string;
  initialEvents: EventRow[];
}) {
  const t = useTranslations("FacilityProfile");
  const [events, setEvents] = useState<EventRow[]>(initialEvents);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [draftType, setDraftType] = useState<RelationshipEventInput["type"]>("EVENT");
  const [draftDate, setDraftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [draftNote, setDraftNote] = useState("");
  const [draftAttachmentUrl, setDraftAttachmentUrl] = useState("");

  function refreshRoute() {
    // Las server actions ya llaman revalidatePath, pero esta vista maneja su
    // propia lista local (más simple que re-fetchear todo el detalle) — un
    // reload suave alcanza porque el resto de la página es Server Component.
    window.location.reload();
  }

  function handleAdd() {
    if (!draftNote.trim()) return;
    setError(null);
    const input: RelationshipEventInput = {
      type: draftType,
      date: draftDate,
      note: draftNote.trim(),
      status: draftType === "ACTION_ITEM" ? "OPEN" : null,
      attachmentUrl: draftType === "AGREEMENT" && draftAttachmentUrl.trim() ? draftAttachmentUrl.trim() : null,
    };
    startTransition(async () => {
      const result = await addRelationshipEvent(facilityId, input);
      if (result.ok) {
        setDraftNote("");
        setDraftAttachmentUrl("");
        refreshRoute();
      } else {
        setError(t(`errors.${result.errorKey}`));
      }
    });
  }

  function handleToggleStatus(event: EventRow) {
    const next = event.status === "OPEN" ? "CLOSED" : "OPEN";
    startTransition(async () => {
      const result = await updateRelationshipEventStatus(event.id, facilityId, next);
      if (result.ok) {
        setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, status: next } : e)));
      } else {
        setError(t(`errors.${result.errorKey}`));
      }
    });
  }

  function handleDelete(eventId: string) {
    startTransition(async () => {
      const result = await deleteRelationshipEvent(eventId, facilityId);
      if (result.ok) {
        setEvents((prev) => prev.filter((e) => e.id !== eventId));
      } else {
        setError(t(`errors.${result.errorKey}`));
      }
    });
  }

  return (
    <section className="rounded-2xl bg-surface shadow-sm p-5">
      <h2 className="font-display text-base font-semibold text-ink mb-1">{t("history.title")}</h2>
      <p className="text-[11px] text-ink-faint mb-4">{t("history.subtitle")}</p>

      <div className="space-y-3 mb-5">
        {events.map((event) => (
          <div key={event.id} className="flex items-start gap-3 border-b border-surface-sunken pb-3 last:border-b-0 last:pb-0">
            <span className="text-[10px] uppercase tracking-wide text-ink-faint whitespace-nowrap pt-0.5">{event.date}</span>
            <span className="text-[10px] uppercase tracking-wide rounded-full bg-brand-soft text-brand px-2 py-0.5 whitespace-nowrap">
              {t(`history.type.${event.type}`)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink whitespace-pre-wrap">{event.note}</p>
              {event.attachmentUrl && (
                <a href={event.attachmentUrl} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline">
                  {t("history.attachmentLinkLabel")}
                </a>
              )}
            </div>
            {event.type === "ACTION_ITEM" && event.status && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleToggleStatus(event)}
                className={
                  event.status === "OPEN"
                    ? "text-[10px] uppercase tracking-wide rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 whitespace-nowrap hover:bg-amber-200"
                    : "text-[10px] uppercase tracking-wide rounded-full bg-surface-sunken text-ink-faint px-2 py-0.5 whitespace-nowrap hover:bg-border"
                }
              >
                {t(`history.status.${event.status}`)}
              </button>
            )}
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleDelete(event.id)}
              className="text-xs text-ink-faint hover:text-red-600 whitespace-nowrap"
            >
              {t("history.delete")}
            </button>
          </div>
        ))}
        {events.length === 0 && <p className="text-xs text-ink-faint">{t("history.empty")}</p>}
      </div>

      <div className="rounded-xl bg-surface-sunken/50 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className={labelClass}>{t("history.newType")}</label>
            <select className={inputClass} value={draftType} onChange={(e) => setDraftType(e.target.value as RelationshipEventInput["type"])}>
              {EVENT_TYPES.map((type) => (
                <option key={type} value={type}>{t(`history.type.${type}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t("history.newDate")}</label>
            <input type="date" className={inputClass} value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
          </div>
          {draftType === "AGREEMENT" && (
            <div className="col-span-2">
              <label className={labelClass}>{t("history.attachmentUrlLabel")}</label>
              <input
                className={inputClass}
                placeholder={t("history.attachmentUrlPlaceholder")}
                value={draftAttachmentUrl}
                onChange={(e) => setDraftAttachmentUrl(e.target.value)}
              />
            </div>
          )}
        </div>
        <label className={labelClass}>{t("history.newNote")}</label>
        <textarea rows={2} className={inputClass} value={draftNote} onChange={(e) => setDraftNote(e.target.value)} />
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            disabled={isPending || !draftNote.trim()}
            onClick={handleAdd}
            className="rounded-md bg-brand text-white text-xs font-medium px-3 py-1.5 hover:bg-brand/90 disabled:opacity-50"
          >
            {t("history.addEvent")}
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>
    </section>
  );
}
