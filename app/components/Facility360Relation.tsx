import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithAccess } from "../lib/db/users";
import { hasLevel } from "../lib/module";
import { getGameReviewSatisfaction, computePlayerComplaintsSummary } from "../lib/db/satisfaction";
import { getFacilityLogEntries, getWeeklyNotesForFacility } from "../lib/db/facilityLog";
import { getFacilityDeep } from "../lib/db/queries";
import { addDays } from "../lib/facilityNowCalc";
import GroupSection from "./GroupSection";
import GameReviewsPanel from "./GameReviewsPanel";

// Capa 8: Relación y calidad. Satisfacción de jugadores (para todo el módulo Análisis) y, solo para quien tiene
// acceso al módulo Equipo, las últimas entradas de la Bitácora y las notas del Registro semanal de la facility.

type T = (key: string, values?: Record<string, string | number>) => string;
const TEAM_ROWS = 5;

export default async function Facility360Relation({ facilityId, date }: { facilityId: string; date?: string }) {
  const [tr, trLog, access, deep, sat] = await Promise.all([
    getTranslations("Facility360"),
    getTranslations("FacilityLog.kinds"),
    getCurrentUserWithAccess(),
    getFacilityDeep(facilityId, date),
    getGameReviewSatisfaction({ facilityId }),
  ]);
  const t = tr as unknown as T;
  const team = !!access && hasLevel(access.access.TEAM, "VIEW");
  const [log, notes] = team
    ? await Promise.all([
        getFacilityLogEntries({ facilityId }, { limit: TEAM_ROWS, meId: access.user.id }),
        getWeeklyNotesForFacility(facilityId, addDays(deep?.refISO ?? new Date().toISOString().slice(0, 10), -90)),
      ])
    : [null, []];
  const dl = (iso: string) => iso.slice(5).replace("-", "/");

  return (
    <div id="relacion" className="scroll-mt-32">
      <GroupSection title={t("nav.relation")}>
        {sat.summary.totalReviews > 0 ? (
          <GameReviewsPanel summary={sat.summary} complaints={computePlayerComplaintsSummary(sat.summary)} facilityFieldQuality={sat.facilityFieldQuality} recentReviews={sat.recentReviews} showRanking={false} />
        ) : (
          <div className="rounded-2xl bg-surface shadow-sm p-5 text-sm text-ink-faint">{t("relation.noReviews")}</div>
        )}

        {team && log && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl bg-surface shadow-sm p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium text-ink">{t("relation.logTitle")}</h3>
                <Link href={`/facility-log?facilityId=${facilityId}`} className="text-xs text-brand hover:underline">{t("relation.openLog")}</Link>
              </div>
              {log.rows.length === 0 ? (
                <p className="text-sm text-ink-faint mt-3">{t("relation.logEmpty")}</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {log.rows.map((r) => (
                    <li key={r.id} className="text-sm">
                      <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                        <span className="rounded-full bg-surface-sunken text-ink-muted px-2 py-0.5 font-medium">{trLog(r.kind)}</span>
                        <span>{dl(r.date)}</span>
                        {r.authorName && <span>· {r.authorName}</span>}
                      </div>
                      <p className="text-ink-muted mt-0.5 line-clamp-3">{r.text}</p>
                    </li>
                  ))}
                </ul>
              )}
              {log.hasMore && <p className="text-[11px] text-ink-faint mt-3">{t("relation.logMore")}</p>}
            </div>
            <div className="rounded-2xl bg-surface shadow-sm p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium text-ink">{t("relation.notesTitle")}</h3>
                <Link href={`/facility-profile/${facilityId}`} className="text-xs text-brand hover:underline">{t("relation.openProfile")}</Link>
              </div>
              {notes.length === 0 ? (
                <p className="text-sm text-ink-faint mt-3">{t("relation.notesEmpty")}</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {notes.slice(0, TEAM_ROWS).map((n) => (
                    <li key={n.id} className="text-sm">
                      <div className="text-[11px] text-ink-faint">{dl(n.date)}{n.topic ? ` · ${n.topic}` : ""} · {n.authorName}</div>
                      <p className="text-ink-muted mt-0.5 line-clamp-3">{n.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </GroupSection>
    </div>
  );
}
