"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { WeeklyLogRow } from "../lib/db/weeklyLog";
import { addWeeklyLogEntry, deleteWeeklyLogEntry, updateWeeklyLogEntry, type WeeklyLogInput } from "../lib/actions/weeklyLog";
import { buildReport, formatDay, matchFacilityId, MAX_TEXT_LENGTH, MAX_TOPIC_LENGTH, type WeekRange } from "../lib/weeklyLog";

type Facility = { id: string; name: string; market: string };
type Me = { id: string; isAdmin: boolean; canEdit: boolean };

const inputClass =
  "w-full rounded-md border border-border bg-surface-sunken/60 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand/30 hover:border-border-strong transition-colors";
const labelClass = "block text-xs text-ink-muted mb-1";
const primaryBtn = "rounded-md bg-brand text-white text-sm font-medium px-3.5 py-2 hover:bg-brand/90 disabled:opacity-50 transition-colors";
const ghostBtn = "rounded-md border border-border bg-surface text-sm text-ink px-3 py-1.5 hover:border-border-strong disabled:opacity-50 transition-colors";
const linkBtn = "text-xs text-ink-faint hover:text-ink disabled:opacity-50";

export default function WeeklyLogBoard({
  range,
  rangeLabel,
  today,
  isCurrentWeek,
  entries,
  me,
  facilities,
  recentTopics,
}: {
  range: WeekRange;
  rangeLabel: string;
  today: string;
  isCurrentWeek: boolean;
  entries: WeeklyLogRow[];
  me: Me;
  facilities: Facility[];
  recentTopics: string[];
}) {
  const t = useTranslations("WeeklyLog");
  const locale = useLocale() as "es" | "en";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ---------- Filtro por persona ----------
  // "all" | id de usuario. Las personas salen de quienes escribieron esta semana.
  // Sin useMemo: son decenas de notas por semana, recalcular es gratis.
  const authorNames = new Map<string, string>();
  for (const e of entries) authorNames.set(e.authorId, e.authorName);
  const people = [...authorNames.entries()].sort((a, b) => (a[0] === me.id ? -1 : b[0] === me.id ? 1 : a[1].localeCompare(b[1])));
  const [who, setWho] = useState<string>("all");
  const shown = who === "all" ? entries : entries.filter((e) => e.authorId === who);

  // ---------- Formulario de alta ----------
  const defaultDate = isCurrentWeek ? today : range.to;
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState(defaultDate);
  const linked = matchFacilityId(topic, facilities);
  const linkedFacility = linked ? facilities.find((f) => f.id === linked) : null;

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

  function submit() {
    if (!text.trim()) return;
    const input: WeeklyLogInput = { date, text, topic };
    run(
      () => addWeeklyLogEntry(input),
      () => {
        setText("");
        setNotice(t("saved"));
        setTimeout(() => setNotice(null), 3000);
      }
    );
  }

  // ---------- Edición / borrado ----------
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<WeeklyLogInput>({ date: "", text: "", topic: "" });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function startEdit(e: WeeklyLogRow) {
    setEditingId(e.id);
    setConfirmDelete(null);
    setEdit({ date: e.date, text: e.text, topic: e.topic ?? "" });
  }

  // ---------- Reporte ----------
  const [report, setReport] = useState("");
  function makeReport() {
    const subject = t("report.subject", { range: rangeLabel });
    setReport(
      buildReport(
        shown.map((e) => ({ date: e.date, text: e.text, topic: e.facilityName ?? e.topic, authorName: e.authorName })),
        { subject, general: t("report.general"), byAuthor: (name) => t("report.byAuthor", { name }) },
        locale
      )
    );
    setNotice(null);
  }
  const [copied, setCopied] = useState(false);
  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(t("errors.copy"));
    }
  }
  function downloadReport() {
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registro-semanal_${range.from}_${range.to}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Agrupado por día ----------
  const dayMap = new Map<string, WeeklyLogRow[]>();
  for (const e of shown) {
    if (!dayMap.has(e.date)) dayMap.set(e.date, []);
    dayMap.get(e.date)!.push(e);
  }
  const byDay = [...dayMap.entries()].sort((a, b) => b[0].localeCompare(a[0])); // lo más reciente arriba

  const topicListId = "weekly-log-topics";
  const topicOptions = (
    <datalist id={topicListId}>
      {facilities.map((f) => (
        <option key={f.id} value={f.name}>{f.market}</option>
      ))}
      {recentTopics.map((tp) => (
        <option key={`t-${tp}`} value={tp} />
      ))}
    </datalist>
  );

  const reportScope = who === "all" ? t("report.scopeAll") : who === me.id ? t("report.scopeMine") : t("report.scopeOf", { name: people.find(([id]) => id === who)?.[1] ?? "" });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start">
      {topicOptions}
      <section className="space-y-5 min-w-0">
        {/* Alta (solo con EDIT en Equipo) */}
        {!me.canEdit && <p className="rounded-xl bg-surface-sunken px-4 py-3 text-xs text-ink-muted">{t("readOnly")}</p>}
        {me.canEdit && (
        <form
          className="rounded-2xl bg-surface shadow-sm p-5 space-y-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            submit();
          }}
        >
          <h2 className="font-display text-base font-semibold text-ink">{t("form.title")}</h2>
          <div>
            <label htmlFor="wl-text" className={labelClass}>{t("form.text")}</label>
            <textarea
              id="wl-text"
              rows={3}
              maxLength={MAX_TEXT_LENGTH}
              className={`${inputClass} resize-y`}
              placeholder={t("form.textPlaceholder")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] items-end">
            <div className="min-w-0">
              <label htmlFor="wl-topic" className={labelClass}>{t("form.topic")}</label>
              <input
                id="wl-topic"
                list={topicListId}
                maxLength={MAX_TOPIC_LENGTH}
                className={inputClass}
                placeholder={t("form.topicPlaceholder")}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="wl-date" className={labelClass}>{t("form.date")}</label>
              <input id="wl-date" type="date" min={range.from} max={range.to} className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <button type="submit" disabled={isPending || !text.trim()} className={primaryBtn}>{t("form.submit")}</button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-5 text-xs">
            <span className="text-ink-faint">
              {linkedFacility ? t("form.linked", { name: linkedFacility.name, market: linkedFacility.market }) : t("form.shortcut")}
            </span>
            {error && <span className="text-danger" role="alert">{error}</span>}
            {!error && notice && <span className="text-brand" role="status">{notice}</span>}
          </div>
        </form>
        )}

        {/* Filtro */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-muted mr-1">{t("filter.label")}</span>
          {[["all", t("filter.all")] as const, ...people.map(([id, name]) => [id, id === me.id ? t("filter.me") : name] as const)].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={who === id}
              onClick={() => setWho(id)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                who === id ? "bg-brand text-white border-brand" : "bg-surface text-ink-muted border-border hover:border-border-strong"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-xs text-ink-faint">{t("count", { count: shown.length })}</span>
        </div>

        {/* Lista */}
        {byDay.length === 0 ? (
          <p className="rounded-2xl bg-surface-sunken p-6 text-sm text-ink-muted">{entries.length ? t("emptyFiltered") : t("empty")}</p>
        ) : (
          <div className="rounded-2xl bg-surface shadow-sm divide-y divide-surface-sunken">
            {byDay.map(([day, items]) => (
              <div key={day} className="p-4">
                <h3 className="text-[11px] uppercase tracking-wide text-ink-faint mb-2">
                  {formatDay(day, locale, { weekday: "long", day: "numeric", month: "short" })}
                </h3>
                <ul className="space-y-3">
                  {items.map((e) => {
                    const mine = e.authorId === me.id;
                    const canEdit = (mine && me.canEdit) || me.isAdmin;
                    if (editingId === e.id) {
                      return (
                        <li key={e.id} className="rounded-xl bg-surface-sunken/60 p-3 space-y-2">
                          <textarea rows={3} maxLength={MAX_TEXT_LENGTH} className={`${inputClass} resize-y`} value={edit.text} onChange={(ev) => setEdit({ ...edit, text: ev.target.value })} aria-label={t("form.text")} />
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                            <input list={topicListId} maxLength={MAX_TOPIC_LENGTH} className={inputClass} value={edit.topic} onChange={(ev) => setEdit({ ...edit, topic: ev.target.value })} aria-label={t("form.topic")} placeholder={t("form.topicPlaceholder")} autoComplete="off" />
                            <input type="date" className={inputClass} value={edit.date} onChange={(ev) => setEdit({ ...edit, date: ev.target.value })} aria-label={t("form.date")} />
                          </div>
                          <div className="flex gap-2">
                            <button type="button" className={primaryBtn} disabled={isPending || !edit.text.trim()} onClick={() => run(() => updateWeeklyLogEntry(e.id, edit), () => setEditingId(null))}>{t("save")}</button>
                            <button type="button" className={ghostBtn} disabled={isPending} onClick={() => setEditingId(null)}>{t("cancel")}</button>
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li key={e.id} className="border-l-[3px] border-accent pl-3">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-0.5">
                          {e.facilityId ? (
                            <Link href={`/map/${e.facilityId}`} className="text-[11px] font-semibold rounded bg-brand-soft text-brand px-1.5 py-0.5 hover:underline">
                              {e.facilityName}
                            </Link>
                          ) : e.topic ? (
                            <span className="text-[11px] font-semibold rounded bg-surface-sunken text-ink-muted px-1.5 py-0.5">{e.topic}</span>
                          ) : null}
                          <span className="text-[11px] text-ink-faint">{mine ? t("filter.me") : e.authorName}</span>
                        </div>
                        <p className="text-sm text-ink whitespace-pre-wrap break-words">{e.text}</p>
                        {canEdit && (
                          <div className="flex gap-3 mt-1">
                            <button type="button" className={linkBtn} disabled={isPending} onClick={() => startEdit(e)}>{t("edit")}</button>
                            {confirmDelete === e.id ? (
                              <span className="flex items-center gap-2 text-xs">
                                <span className="text-ink-muted">{t("confirmDelete")}</span>
                                <button type="button" className="text-danger font-semibold hover:underline" disabled={isPending} onClick={() => run(() => deleteWeeklyLogEntry(e.id), () => setConfirmDelete(null))}>{t("yes")}</button>
                                <button type="button" className={linkBtn} onClick={() => setConfirmDelete(null)}>{t("no")}</button>
                              </span>
                            ) : (
                              <button type="button" className={`${linkBtn} hover:text-danger`} disabled={isPending} onClick={() => setConfirmDelete(e.id)}>{t("delete")}</button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reporte */}
      <section className="rounded-2xl bg-surface shadow-sm p-5 space-y-3 lg:sticky lg:top-20 min-w-0">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">{t("report.title")}</h2>
          <p className="text-xs text-ink-muted">{t("report.help", { scope: reportScope })}</p>
        </div>
        <button type="button" className={primaryBtn} disabled={!shown.length} onClick={makeReport}>
          {report ? t("report.rebuild") : t("report.build")}
        </button>
        <textarea
          aria-label={t("report.textLabel")}
          className={`${inputClass} font-mono text-[13px] leading-relaxed min-h-80 resize-y`}
          placeholder={t("report.placeholder")}
          value={report}
          onChange={(e) => setReport(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={ghostBtn} disabled={!report.trim()} onClick={copyReport}>{copied ? t("report.copied") : t("report.copy")}</button>
          <button type="button" className={ghostBtn} disabled={!report.trim()} onClick={downloadReport}>{t("report.download")}</button>
        </div>
      </section>
    </div>
  );
}
