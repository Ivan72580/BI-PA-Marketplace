import { countsForDemand } from "./metrics";

// Aportes y puntos críticos del Reporte operativo (por región, market o toda la red). Lógica pura: recibe los partidos del
// período (una fila por partido) y devuelve, sin consultar la base:
//   · quiénes aportan más cancelaciones, con el desglose de motivos y qué hacer según el motivo dominante;
//   · qué canchas aportan más confirmaciones y cuáles son sus slots (cancha + día + hora) más fuertes;
//   · los puntos críticos: slots que se cancelan seguido y facilities muy por encima de la tasa de la red.
// Un "slot" es cancha (Field) + día + hora dentro de una facility; las filas sin nombre de cancha se agrupan como "sin cancha".

export type ContribGame = { facilityId: string; fieldName: string | null; dayOfWeek: string; time: string; status: string; cancellationCategory: string | null };
export type FacilityInfo = { name: string; market: string };

export const TOP_FACILITIES = 5;
export const TOP_SLOTS = 3;
export const MIN_SLOT_GAMES = 3; // partidos mínimos de un slot para opinar sobre él
export const CRITICAL_SLOT_RATE = 0.5; // un slot es crítico si se cancela al menos la mitad de las veces...
export const CRITICAL_SLOT_CANCELS = 2; // ...y al menos 2 veces
export const CRITICAL_FACILITY_GAP = 0.1; // y una facility, si supera en 10 puntos la tasa de cancelación de la red
export const CRITICAL_FACILITY_MIN_GAMES = 7; // 1 partido por día en una semana (igual que MIN_GAMES_FOR_RANKING)

export type SlotRef = { field: string | null; day: string; time: string };
export type ReasonShare = { category: string; count: number; pct: number }; // pct sobre las cancelaciones del grupo

export type CancelContributor = {
  facilityId: string; name: string; market: string;
  cancelled: number; shareOfCancelled: number; games: number; cancelRate: number;
  reasons: ReasonShare[]; // las 3 principales
  dominantCategory: string | null;
  actionKey: string;
  worstSlot: (SlotRef & { cancelled: number; games: number }) | null;
};
export type ConfirmContributor = {
  facilityId: string; name: string; market: string;
  confirmed: number; shareOfConfirmed: number; games: number; rate: number; changePct: number | null;
  topSlots: (SlotRef & { confirmed: number; games: number; rate: number })[];
};
export type CriticalSlot = SlotRef & { facilityId: string; name: string; market: string; games: number; cancelled: number; rate: number; dominantCategory: string | null };
export type CriticalFacility = { facilityId: string; name: string; market: string; games: number; cancelled: number; rate: number; gap: number; dominantCategory: string | null };

export type ContributionReport = {
  totals: { games: number; confirmed: number; cancelled: number; cancelRate: number };
  cancellations: CancelContributor[];
  /** Con cuántas facilities se llega al 50 % de las cancelaciones (concentración). */
  cancelHalfAt: number;
  confirmations: ConfirmContributor[];
  criticalSlots: CriticalSlot[];
  criticalFacilities: CriticalFacility[];
};

export function actionKeyForCategory(category: string | null): string {
  switch (category) {
    case "MAINTENANCE":
    case "FACILITY_UNAVAILABLE": return "facilityFocus.action.facilityIssue";
    case "NOT_ENOUGH_PLAYERS": return "facilityFocus.action.demand";
    case "WEATHER": return "facilityFocus.action.weather";
    case "HOLIDAY": return "facilityFocus.action.holiday";
    default: return "facilityFocus.action.unclear";
  }
}

type Agg = { games: number; confirmed: number; cancelled: number; demandBase: number; reasons: Map<string, number> };
const emptyAgg = (): Agg => ({ games: 0, confirmed: 0, cancelled: 0, demandBase: 0, reasons: new Map() });
function add(a: Agg, g: ContribGame) {
  a.games++;
  if (g.status === "CONFIRMED") a.confirmed++;
  if (g.status === "CANCELLED") {
    a.cancelled++;
    const c = g.cancellationCategory ?? "NONE";
    a.reasons.set(c, (a.reasons.get(c) ?? 0) + 1);
  }
  if (countsForDemand(g.status, g.cancellationCategory)) a.demandBase++;
}
function reasonList(a: Agg): ReasonShare[] {
  return [...a.reasons.entries()].map(([category, count]) => ({ category, count, pct: a.cancelled > 0 ? count / a.cancelled : 0 })).sort((x, y) => y.count - x.count);
}
const dominant = (r: ReasonShare[]) => (r[0] && r[0].category !== "NONE" ? r[0].category : r[0] ? "NONE" : null);

export function buildContribution(
  games: ContribGame[],
  info: Map<string, FacilityInfo>,
  priorConfirmedByFacility: Map<string, number> | null,
): ContributionReport {
  const total = emptyAgg();
  const byFac = new Map<string, Agg>();
  const slotsByFac = new Map<string, Map<string, Agg & SlotRef>>();
  for (const g of games) {
    add(total, g);
    let f = byFac.get(g.facilityId);
    if (!f) byFac.set(g.facilityId, (f = emptyAgg()));
    add(f, g);
    let sm = slotsByFac.get(g.facilityId);
    if (!sm) slotsByFac.set(g.facilityId, (sm = new Map()));
    const key = `${g.fieldName ?? ""}|${g.dayOfWeek}|${g.time}`;
    let s = sm.get(key);
    if (!s) sm.set(key, (s = { ...emptyAgg(), field: g.fieldName, day: g.dayOfWeek, time: g.time }));
    add(s, g);
  }
  const meta = (id: string): FacilityInfo => info.get(id) ?? { name: "—", market: "" };
  const netRate = total.games > 0 ? total.cancelled / total.games : 0;

  const cancellations: CancelContributor[] = [...byFac.entries()]
    .filter(([, a]) => a.cancelled >= 2)
    .sort((x, y) => y[1].cancelled - x[1].cancelled)
    .slice(0, TOP_FACILITIES)
    .map(([id, a]) => {
      const reasons = reasonList(a);
      const dom = dominant(reasons);
      const worst = [...(slotsByFac.get(id)?.values() ?? [])].filter((s) => s.cancelled >= 2).sort((x, y) => y.cancelled - x.cancelled)[0];
      return {
        facilityId: id, ...meta(id),
        cancelled: a.cancelled, shareOfCancelled: total.cancelled > 0 ? a.cancelled / total.cancelled : 0,
        games: a.games, cancelRate: a.games > 0 ? a.cancelled / a.games : 0,
        reasons: reasons.slice(0, 3), dominantCategory: dom, actionKey: actionKeyForCategory(dom === "NONE" ? null : dom),
        worstSlot: worst ? { field: worst.field, day: worst.day, time: worst.time, cancelled: worst.cancelled, games: worst.games } : null,
      };
    });

  let acc = 0; let cancelHalfAt = 0;
  for (const [, a] of [...byFac.entries()].sort((x, y) => y[1].cancelled - x[1].cancelled)) {
    if (total.cancelled === 0) break;
    acc += a.cancelled; cancelHalfAt++;
    if (acc >= total.cancelled / 2) break;
  }

  const confirmations: ConfirmContributor[] = [...byFac.entries()]
    .filter(([, a]) => a.confirmed > 0)
    .sort((x, y) => y[1].confirmed - x[1].confirmed)
    .slice(0, TOP_FACILITIES)
    .map(([id, a]) => {
      const prior = priorConfirmedByFacility?.get(id);
      const topSlots = [...(slotsByFac.get(id)?.values() ?? [])]
        .filter((s) => s.confirmed >= 2)
        .sort((x, y) => y.confirmed - x.confirmed || (y.confirmed / y.games) - (x.confirmed / x.games))
        .slice(0, TOP_SLOTS)
        .map((s) => ({ field: s.field, day: s.day, time: s.time, confirmed: s.confirmed, games: s.games, rate: s.games > 0 ? s.confirmed / s.games : 0 }));
      return {
        facilityId: id, ...meta(id),
        confirmed: a.confirmed, shareOfConfirmed: total.confirmed > 0 ? a.confirmed / total.confirmed : 0,
        games: a.games, rate: a.demandBase > 0 ? a.confirmed / a.demandBase : 0,
        changePct: priorConfirmedByFacility && prior !== undefined && prior > 0 ? (a.confirmed - prior) / prior : null,
        topSlots,
      };
    });

  const criticalSlots: CriticalSlot[] = [];
  for (const [id, sm] of slotsByFac) {
    for (const s of sm.values()) {
      const rate = s.games > 0 ? s.cancelled / s.games : 0;
      if (s.games >= MIN_SLOT_GAMES && s.cancelled >= CRITICAL_SLOT_CANCELS && rate >= CRITICAL_SLOT_RATE) {
        criticalSlots.push({ facilityId: id, ...meta(id), field: s.field, day: s.day, time: s.time, games: s.games, cancelled: s.cancelled, rate, dominantCategory: dominant(reasonList(s)) });
      }
    }
  }
  criticalSlots.sort((x, y) => y.cancelled - x.cancelled || y.rate - x.rate);

  const criticalFacilities: CriticalFacility[] = [...byFac.entries()]
    .filter(([, a]) => a.games >= CRITICAL_FACILITY_MIN_GAMES && a.cancelled / a.games - netRate >= CRITICAL_FACILITY_GAP)
    .map(([id, a]) => ({ facilityId: id, ...meta(id), games: a.games, cancelled: a.cancelled, rate: a.cancelled / a.games, gap: a.cancelled / a.games - netRate, dominantCategory: dominant(reasonList(a)) }))
    .sort((x, y) => y.gap - x.gap);

  return {
    totals: { games: total.games, confirmed: total.confirmed, cancelled: total.cancelled, cancelRate: netRate },
    cancellations, cancelHalfAt, confirmations,
    criticalSlots: criticalSlots.slice(0, 6), criticalFacilities: criticalFacilities.slice(0, 4),
  };
}
