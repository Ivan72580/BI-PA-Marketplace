"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { LogRow } from "../lib/db/facilityLog";
import {
  addFacilityLogEntry,
  addFacilityLogReply,
  deleteFacilityLogEntry,
  deleteFacilityLogReply,
  reactToFacilityLogEntry,
  updateFacilityLogEntry,
} from "../lib/actions/facilityLog";
import {
  EVENT_CATALOG,
  EVENT_TYPES,
  INSIGHT_KINDS,
  LOG_KINDS,
  MAX_REPLY_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_TOPIC_LENGTH,
  PEDIDO_RESOLUTIONS,
  REJECTED_RESOLUTIONS,
  SENTIMENTS,
  TONES,
  type EventField,
  type EventType,
  type InsightKind,
  type LogInput,
  type LogKind,
  type Sentiment,
  type Tone,
} from "../lib/facilityLog";
import { formatDay } from "../lib/weeklyLog";

type Facility = { id: string; name: string; market: string };
type Me = { id: string; isAdmin: boolean; canEdit: boolean };
type Loc = "es" | "en";

const inputClass =
  "w-full rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink placeholder:text-ink-faint ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-brand/40 hover:ring-border-strong transition-colors";
const labelClass = "block text-xs font-medium text-ink-muted mb-1";
const primaryBtn = "rounded-full bg-ink text-white text-sm font-medium px-4 py-2 hover:bg-ink/85 disabled:opacity-50 transition-colors";
const ghostBtn = "rounded-full bg-surface text-sm font-medium text-ink px-3.5 py-1.5 shadow-sm hover:shadow-md disabled:opacity-50 transition-shadow";
const linkBtn = "text-xs text-ink-faint hover:text-ink disabled:opacity-50";

const TONE_CLASS: Record<Tone, string> = {
  CORDIAL: "bg-surface-panel text-ink-muted",
  TENSE: "bg-warning-soft text-warning",
  HOSTILE: "bg-danger-soft text-danger",
};
const SENTIMENT_DOT: Record<Sentiment, string> = { POSITIVE: "bg-brand", NEUTRAL: "bg-ink-faint", NEGATIVE: "bg-danger" };

// ---------- Formulario (alta y edición) ----------

type FormState = {
  facilityId: string;
  kind: LogKind;
  date: string;
  text: string;
  evidenceUrl: string;
  topic: string;
  sentiment: Sentiment;
  eventType: EventType;
  subtype: string;
  tone: Tone | "";
  resolution: string;
  usedData: boolean | null;
  committedSlot: boolean | null;
  hours: string;
  hoursSincePublished: string;
  playersSigned: string;
  severity: string;
  gameId: string;
  insightKind: InsightKind;
};

const str = (n: number | null) => (n === null ? "" : String(n));

function initialState(facilityId: string, date: string, row?: LogRow): FormState {
  return {
    facilityId: row?.facilityId ?? facilityId,
    kind: row?.kind ?? "EVENT",
    date: row?.date ?? date,
    text: row?.text ?? "",
    evidenceUrl: row?.evidenceUrl ?? "",
    topic: row?.topic ?? "",
    sentiment: row?.sentiment ?? "NEUTRAL",
    eventType: row?.eventType ?? "RETIRO_SLOT",
    subtype: row?.subtype ?? "",
    tone: row?.tone ?? "",
    resolution: row?.resolution ?? "",
    usedData: row?.usedData ?? null,
    committedSlot: row?.committedSlot ?? null,
    hours: str(row?.hours ?? null),
    hoursSincePublished: str(row?.hoursSincePublished ?? null),
    playersSigned: str(row?.playersSigned ?? null),
    severity: str(row?.severity ?? null),
    gameId: str(row?.gameId ?? null),
    insightKind: row?.insightKind ?? "EXPECT",
  };
}

const num = (s: string): number | null => {
  const v = s.trim();
  return v === "" ? null : Number(v);
};

function toInput(f: FormState): LogInput {
  const base: LogInput = { facilityId: f.facilityId, kind: f.kind, date: f.date, text: f.text, evidenceUrl: f.evidenceUrl };
  if (f.kind === "OBSERVATION") return { ...base, topic: f.topic, sentiment: f.sentiment };
  if (f.kind === "INSIGHT") return { ...base, insightKind: f.insightKind };
  return {
    ...base,
    eventType: f.eventType,
    subtype: f.subtype || undefined,
    tone: f.tone || undefined,
    resolution: f.resolution || undefined,
    usedData: f.usedData ?? undefined,
    committedSlot: f.committedSlot ?? undefined,
    hours: num(f.hours),
    hoursSincePublished: num(f.hoursSincePublished),
    playersSigned: num(f.playersSigned),
    severity: num(f.severity),
    gameId: num(f.gameId),
  };
}

function YesNo({ value, onChange, t }: { value: boolean | null; onChange: (v: boolean | null) => void; t: (k: string) => string }) {
  const opts: [boolean | null, string][] = [[true, "fields.yes"], [false, "fields.no"], [null, "fields.unknown"]];
  return (
    <div className="inline-flex gap-0.5 rounded-full bg-surface-panel p-1 text-xs">
      {opts.map(([v, key]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1 transition-colors ${value === v ? "bg-surface text-ink font-semibold shadow-sm" : "text-ink-muted hover:text-ink"}`}
        >
          {t(key)}
        </button>
      ))}
    </div>
  );
}

function LogForm({
  initial,
  row,
  facilities,
  topics,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  row?: LogRow;
  facilities: Facility[];
  topics: string[];
  pending: boolean;
  submitLabel: string;
  onSubmit: (input: LogInput) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("FacilityLog");
  const [f, setF] = useState<FormState>(initial);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const def = EVENT_CATALOG[f.eventType];
  const has = (field: EventField) => f.kind === "EVENT" && def.fields.includes(field);
  const rejected = REJECTED_RESOLUTIONS.includes(f.resolution);

  const missing =
    !f.facilityId ||
    !f.text.trim() ||
    (f.kind === "OBSERVATION" && !f.topic.trim()) ||
    (f.kind === "EVENT" && ((def.subtypeRequired && !f.subtype) || (has("severity") && !f.severity)));

  function pickEventType(next: EventType) {
    // Los campos son específicos de cada tipo: al cambiar de tipo se descartan los del anterior.
    setF((prev) => ({
      ...prev,
      eventType: next,
      subtype: "",
      tone: "",
      resolution: "",
      usedData: null,
      committedSlot: null,
      hours: "",
      hoursSincePublished: "",
      playersSigned: "",
      severity: "",
    }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!missing) onSubmit(toInput(f));
      }}
      className="rounded-2xl bg-surface shadow-md p-5 space-y-4"
    >
      <div className="inline-flex gap-0.5 rounded-full bg-surface-panel p-1" role="tablist">
        {LOG_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={f.kind === k}
            // Al editar no se cambia el tipo de aporte: los campos de uno no existen en otro.
            disabled={!!row && row.kind !== k}
            onClick={() => set("kind", k)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors disabled:opacity-40 ${f.kind === k ? "bg-surface text-ink font-semibold shadow-sm" : "text-ink-muted font-medium hover:text-ink"}`}
          >
            {t(`kinds.${k}`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-faint -mt-2">{t(`kindHints.${f.kind}`)}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>{t("fields.facility")}</span>
          <select className={inputClass} value={f.facilityId} onChange={(e) => set("facilityId", e.target.value)}>
            <option value="">{t("fields.facilityPlaceholder")}</option>
            {facilities.map((x) => (
              <option key={x.id} value={x.id}>{x.name} · {x.market}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>{t("fields.date")}</span>
          <input type="date" className={inputClass} value={f.date} onChange={(e) => set("date", e.target.value)} />
        </label>
      </div>

      {f.kind === "EVENT" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>{t("fields.eventType")}</span>
              <select className={inputClass} value={f.eventType} onChange={(e) => pickEventType(e.target.value as EventType)}>
                {EVENT_TYPES.map((x) => (
                  <option key={x} value={x}>{t(`eventTypes.${x}`)}</option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-ink-faint">{t(`eventTypeHints.${f.eventType}`)}</span>
            </label>
            {def.subtypes.length > 0 && (
              <label className="block">
                <span className={labelClass}>{t("fields.subtype")}</span>
                <select className={inputClass} value={f.subtype} onChange={(e) => set("subtype", e.target.value)}>
                  <option value="">{t("fields.subtypePlaceholder")}</option>
                  {def.subtypes.map((x) => (
                    <option key={x} value={x}>{t(`subtypes.${f.eventType}.${x}`)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {has("hours") && (
              <label className="block">
                <span className={labelClass}>{t(`fields.hours.${f.eventType}`)}</span>
                <input type="number" min={0} inputMode="numeric" className={inputClass} value={f.hours} onChange={(e) => set("hours", e.target.value)} />
              </label>
            )}
            {has("hoursSincePublished") && (
              <label className="block">
                <span className={labelClass}>{t("fields.hoursSincePublished")}</span>
                <input type="number" min={0} inputMode="numeric" className={inputClass} value={f.hoursSincePublished} onChange={(e) => set("hoursSincePublished", e.target.value)} />
              </label>
            )}
            {has("playersSigned") && (
              <label className="block">
                <span className={labelClass}>{t("fields.playersSigned")}</span>
                <input type="number" min={0} inputMode="numeric" className={inputClass} value={f.playersSigned} onChange={(e) => set("playersSigned", e.target.value)} />
              </label>
            )}
            {has("severity") && (
              <label className="block sm:col-span-2">
                <span className={labelClass}>{t("fields.severity")}</span>
                <select className={inputClass} value={f.severity} onChange={(e) => set("severity", e.target.value)}>
                  <option value="">{t("fields.severityPlaceholder")}</option>
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>{t(`severities.${n}`)}</option>
                  ))}
                </select>
              </label>
            )}
            {has("resolution") && (
              <label className="block sm:col-span-2">
                <span className={labelClass}>{t("fields.resolution")}</span>
                <select
                  className={inputClass}
                  value={f.resolution}
                  onChange={(e) => setF((prev) => ({ ...prev, resolution: e.target.value, usedData: REJECTED_RESOLUTIONS.includes(e.target.value) ? prev.usedData : null }))}
                >
                  <option value="">{t("fields.resolutionPlaceholder")}</option>
                  {PEDIDO_RESOLUTIONS.map((x) => (
                    <option key={x} value={x}>{t(`resolutions.${x}`)}</option>
                  ))}
                </select>
              </label>
            )}
            {has("tone") && (
              <label className="block">
                <span className={labelClass}>{t("fields.tone")}</span>
                <select className={inputClass} value={f.tone} onChange={(e) => set("tone", e.target.value as Tone | "")}>
                  <option value="">{t("fields.tonePlaceholder")}</option>
                  {TONES.map((x) => (
                    <option key={x} value={x}>{t(`tones.${x}`)}</option>
                  ))}
                </select>
                {f.tone && <span className="mt-1 block text-[11px] text-ink-faint">{t(`toneHints.${f.tone}`)}</span>}
              </label>
            )}
          </div>

          {(has("committedSlot") || (has("usedData") && rejected)) && (
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {has("committedSlot") && (
                <div>
                  <span className={labelClass}>{t("fields.committedSlot")}</span>
                  <YesNo value={f.committedSlot} onChange={(v) => set("committedSlot", v)} t={t} />
                </div>
              )}
              {has("usedData") && rejected && (
                <div>
                  <span className={labelClass}>{t("fields.usedData")}</span>
                  <YesNo value={f.usedData} onChange={(v) => set("usedData", v)} t={t} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {f.kind === "OBSERVATION" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>{t("fields.topic")}</span>
            <input className={inputClass} list="facility-log-topics" maxLength={MAX_TOPIC_LENGTH} placeholder={t("fields.topicPlaceholder")} value={f.topic} onChange={(e) => set("topic", e.target.value)} />
            <datalist id="facility-log-topics">
              {topics.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </label>
          <div>
            <span className={labelClass}>{t("fields.sentiment")}</span>
            <div className="inline-flex gap-0.5 rounded-full bg-surface-panel p-1 text-sm">
              {SENTIMENTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("sentiment", s)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors ${f.sentiment === s ? "bg-surface text-ink font-semibold shadow-sm" : "text-ink-muted hover:text-ink"}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${SENTIMENT_DOT[s]}`} aria-hidden="true" />
                  {t(`sentiments.${s}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {f.kind === "INSIGHT" && (
        <div>
          <span className={labelClass}>{t("fields.insightKind")}</span>
          <div className="inline-flex flex-wrap gap-0.5 rounded-full bg-surface-panel p-1 text-sm">
            {INSIGHT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set("insightKind", k)}
                className={`rounded-full px-3 py-1 transition-colors ${f.insightKind === k ? "bg-surface text-ink font-semibold shadow-sm" : "text-ink-muted hover:text-ink"}`}
              >
                {t(`insightKinds.${k}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="block">
        <span className={labelClass}>{t("fields.text")}</span>
        <textarea
          className={`${inputClass} min-h-[96px] resize-y`}
          maxLength={MAX_TEXT_LENGTH}
          placeholder={t(`fields.textPlaceholder.${f.kind}`)}
          value={f.text}
          onChange={(e) => set("text", e.target.value)}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        {f.kind === "EVENT" && (
          <label className="block">
            <span className={labelClass}>{t("fields.gameId")}</span>
            <input type="number" min={1} inputMode="numeric" className={inputClass} value={f.gameId} onChange={(e) => set("gameId", e.target.value)} />
          </label>
        )}
        <label className="block">
          <span className={labelClass}>{t("fields.evidenceUrl")}</span>
          <input type="url" className={inputClass} placeholder="https://" value={f.evidenceUrl} onChange={(e) => set("evidenceUrl", e.target.value)} />
        </label>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={pending || missing} className={primaryBtn}>
          {pending ? t("actions.saving") : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className={ghostBtn}>
          {t("actions.cancel")}
        </button>
      </div>
    </form>
  );
}

// ---------- Tarjeta de un aporte ----------

function detailChips(r: LogRow, t: (k: string, v?: Record<string, string | number>) => string): string[] {
  const out: string[] = [];
  if (r.kind !== "EVENT") return out;
  if (r.committedSlot !== null) out.push(t(r.committedSlot ? "detail.committedYes" : "detail.committedNo"));
  if (r.hours !== null && r.eventType !== "SIN_RESPUESTA") out.push(t("detail.notice", { n: r.hours }));
  if (r.hours !== null && r.eventType === "SIN_RESPUESTA") out.push(t("detail.noReply", { n: r.hours }));
  if (r.hoursSincePublished !== null) out.push(t("detail.sincePublished", { n: r.hoursSincePublished }));
  if (r.playersSigned !== null) out.push(t("detail.signed", { n: r.playersSigned }));
  if (r.severity !== null) out.push(t("detail.severity", { n: r.severity }));
  if (r.resolution) out.push(t("detail.resolution", { value: t(`resolutions.${r.resolution}`) }));
  if (r.usedData !== null) out.push(t(r.usedData ? "detail.usedData" : "detail.noData"));
  if (r.gameId !== null) out.push(t("detail.game", { id: r.gameId }));
  return out;
}

function EntryCard({
  row,
  me,
  facilities,
  topics,
  locale,
  run,
  pending,
}: {
  row: LogRow;
  me: Me;
  facilities: Facility[];
  topics: string[];
  locale: Loc;
  run: (action: () => Promise<{ ok: boolean; errorKey?: string }>, onOk?: () => void) => void;
  pending: boolean;
}) {
  const t = useTranslations("FacilityLog");
  const [editing, setEditing] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [reply, setReply] = useState("");
  const own = row.authorId === me.id;
  const canEditEntry = (own && me.canEdit) || me.isAdmin;

  if (editing) {
    return (
      <LogForm
        initial={initialState(row.facilityId, row.date, row)}
        row={row}
        facilities={facilities}
        topics={topics}
        pending={pending}
        submitLabel={t("actions.save")}
        onSubmit={(input) => run(() => updateFacilityLogEntry(row.id, input), () => setEditing(false))}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const chips = detailChips(row, t);
  const replyCount = row.replies.length;

  return (
    <article className="rounded-2xl bg-surface shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
        <span>{formatDay(row.date, locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
        <span aria-hidden="true">·</span>
        <Link href={`/facility-log?facilityId=${row.facilityId}`} className="font-medium text-ink hover:text-brand">{row.facilityName}</Link>
        <span>{row.marketName}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-surface-panel px-2.5 py-0.5 text-[11px] font-semibold text-ink">{t(`kinds.${row.kind}`)}</span>
        {row.kind === "EVENT" && row.eventType && (
          <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-border">
            {t(`eventTypes.${row.eventType}`)}
            {row.subtype ? ` · ${t(`subtypes.${row.eventType}.${row.subtype}`)}` : ""}
          </span>
        )}
        {row.tone && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${TONE_CLASS[row.tone]}`}>{t(`tones.${row.tone}`)}</span>}
        {row.kind === "OBSERVATION" && row.topic && (
          <span className="flex items-center gap-1.5 rounded-full bg-surface-sunken px-2.5 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-border">
            {row.sentiment && <span className={`h-1.5 w-1.5 rounded-full ${SENTIMENT_DOT[row.sentiment]}`} aria-hidden="true" />}
            {row.topic}
            {row.sentiment ? ` · ${t(`sentiments.${row.sentiment}`)}` : ""}
          </span>
        )}
        {row.kind === "INSIGHT" && row.insightKind && (
          <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-border">{t(`insightKinds.${row.insightKind}`)}</span>
        )}
      </div>

      <p className="mt-2.5 whitespace-pre-wrap text-sm text-ink">{row.text}</p>

      {(chips.length > 0 || row.evidenceUrl) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
          {chips.map((c) => (
            <span key={c}>{c}</span>
          ))}
          {row.evidenceUrl && (
            <a href={row.evidenceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">{t("detail.evidence")}</a>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs">
        <span className="text-ink-faint">{row.authorName ? (own ? `${row.authorName} (${t("actions.you")})` : row.authorName) : t("actions.unknownAuthor")}</span>
        <span className="flex-1" />
        <button
          type="button"
          disabled={pending || own || !me.canEdit}
          title={own ? t("actions.ownEntry") : undefined}
          onClick={() => run(() => reactToFacilityLogEntry(row.id, row.mine === true ? null : true))}
          className={`rounded-full px-3 py-1 transition-colors disabled:cursor-default ${row.mine === true ? "bg-brand-soft text-brand font-semibold" : "bg-surface-sunken text-ink-muted hover:text-ink disabled:hover:text-ink-muted"}`}
        >
          {t("actions.agree")} · {row.agree}
        </button>
        <button
          type="button"
          disabled={pending || own || !me.canEdit}
          title={own ? t("actions.ownEntry") : undefined}
          onClick={() => run(() => reactToFacilityLogEntry(row.id, row.mine === false ? null : false))}
          className={`rounded-full px-3 py-1 transition-colors disabled:cursor-default ${row.mine === false ? "bg-danger-soft text-danger font-semibold" : "bg-surface-sunken text-ink-muted hover:text-ink disabled:hover:text-ink-muted"}`}
        >
          {t("actions.disagree")} · {row.disagree}
        </button>
        <button type="button" onClick={() => setShowReplies((v) => !v)} className={linkBtn}>
          {showReplies ? t("actions.hideReplies") : t("actions.showReplies", { n: replyCount })}
        </button>
        {canEditEntry && (
          <>
            <button type="button" onClick={() => setEditing(true)} disabled={pending} className={linkBtn}>{t("actions.edit")}</button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(t("actions.confirmDelete"))) run(() => deleteFacilityLogEntry(row.id));
              }}
              className={linkBtn}
            >
              {t("actions.delete")}
            </button>
          </>
        )}
      </div>

      {showReplies && (
        <div className="mt-3 space-y-2">
          {row.replies.map((p) => (
            <div key={p.id} className="rounded-xl bg-surface-sunken px-3 py-2 text-sm">
              <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                <span className="font-medium text-ink-muted">{p.authorName}</span>
                <span>{new Date(p.createdAt).toLocaleDateString(locale === "es" ? "es-AR" : "en-US", { day: "numeric", month: "short" })}</span>
                {(p.authorId === me.id || me.isAdmin) && me.canEdit && (
                  <button type="button" disabled={pending} onClick={() => run(() => deleteFacilityLogReply(p.id))} className={`${linkBtn} ml-auto`}>
                    {t("actions.deleteReply")}
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-ink">{p.text}</p>
            </div>
          ))}
          {me.canEdit && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim()) run(() => addFacilityLogReply(row.id, reply), () => setReply(""));
              }}
            >
              <input className={inputClass} maxLength={MAX_REPLY_LENGTH} placeholder={t("actions.replyPlaceholder")} value={reply} onChange={(e) => setReply(e.target.value)} />
              <button type="submit" disabled={pending || !reply.trim()} className={primaryBtn}>{t("actions.send")}</button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}

// ---------- Tablero ----------

export default function FacilityLogBoard({
  rows,
  me,
  facilities,
  topics,
  defaultFacilityId,
  today,
  emptyMessage,
}: {
  rows: LogRow[];
  me: Me;
  facilities: Facility[];
  topics: string[];
  defaultFacilityId: string;
  today: string;
  emptyMessage: string;
}) {
  const t = useTranslations("FacilityLog");
  const locale = useLocale() as Loc;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  function run(action: () => Promise<{ ok: boolean; errorKey?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (r.ok) {
        onOk?.();
        router.refresh();
      } else {
        setError(t(`errors.${r.errorKey ?? "generic"}`));
      }
    });
  }

  return (
    <div className="space-y-4">
      {me.canEdit && (
        <div>
          {composing ? (
            <LogForm
              // key: si cambia la facility del filtro mientras el formulario está abierto, se reinicia con la nueva.
              key={defaultFacilityId}
              initial={initialState(defaultFacilityId, today)}
              facilities={facilities}
              topics={topics}
              pending={pending}
              submitLabel={t("actions.save")}
              onSubmit={(input) => run(() => addFacilityLogEntry(input), () => setComposing(false))}
              onCancel={() => setComposing(false)}
            />
          ) : (
            <button type="button" onClick={() => setComposing(true)} className={primaryBtn}>
              + {t("actions.new")}
            </button>
          )}
        </div>
      )}

      {error && <p className="rounded-xl bg-danger-soft px-4 py-2 text-sm text-danger">{error}</p>}

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-surface-sunken p-6 text-sm text-ink-muted">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <EntryCard key={r.id} row={r} me={me} facilities={facilities} topics={topics} locale={locale} run={run} pending={pending} />
          ))}
        </div>
      )}
    </div>
  );
}
