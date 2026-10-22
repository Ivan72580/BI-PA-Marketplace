"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { setTeamRegions } from "../lib/actions/teamRegions";

// Selector de regiones del módulo Equipo: una, varias o todas. Se recuerda en este navegador y no restringe
// el acceso: sirve para que cada equipo vea solo sus regiones sin mezclar información.
export default function TeamRegionBar({ regions, selected }: { regions: { id: string; name: string }[]; selected: string[] }) {
  const t = useTranslations("TeamRegions");
  const router = useRouter();
  const [pending, start] = useTransition();
  const all = selected.length === 0;

  const apply = (ids: string[]) => start(async () => { await setTeamRegions(ids); router.refresh(); });
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    apply(next.length === regions.length ? [] : next);
  };
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-xs font-medium shadow-sm transition-colors ${on ? "bg-brand text-white" : "bg-surface text-ink-muted hover:text-ink"}`;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-60" : ""}`} role="group" aria-label={t("label")}>
      <span className="text-xs text-ink-faint">{t("label")}</span>
      <button type="button" aria-pressed={all} onClick={() => apply([])} className={chip(all)}>{t("all")}</button>
      {regions.map((r) => (
        <button key={r.id} type="button" aria-pressed={selected.includes(r.id)} onClick={() => toggle(r.id)} className={chip(selected.includes(r.id))}>{r.name}</button>
      ))}
    </div>
  );
}
