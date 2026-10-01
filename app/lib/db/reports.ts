import { GameStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { buildWhere, labelForCancellationCategory, MIN_GAMES_FOR_RANKING, type OverviewFilters } from "./shared";
import { resolvePeriod, shiftAnchor } from "../period";
import { getOverviewData, type OverviewData } from "./overview";
import { getRegionComparison, type RegionComparisonRow } from "./region";
import { getMarketComparison, type MarketComparisonRow } from "./market";
import { getMetricSeriesInWindow, type MetricSeriesPoint } from "./trends";
import type { Locale } from "@/i18n/config";

// Nota sobre i18n: a diferencia de generateOverviewInsights (overview.ts),
// que debe producir strings YA traducidos porque corre dentro de
// unstable_cache (ver overviewMessages.ts), las funciones de este archivo
// devuelven `textKey` + `values` SIN traducir para seasonal/actions — la
// traducción ocurre en la página (app/reports, app/panel-ejecutivo/reports),
// que es un Server Component normal con acceso directo a
// getTranslations("Reports") de next-intl/server. current.insights, en
// cambio, SÍ llega ya traducido: sale de getOverviewData, que internamente
// usa el patrón overviewMessages.ts porque esa función sí corre cacheada.

// ---------- Reportes descargables (Internal Ops Report / Executive Summary) ----------
// Arma el "payload" de datos reales para los dos PDFs pedidos por Ivan
// (semanal o mensual, con los mismos filtros región/market/facility que el
// resto de la app). A propósito NO inventa queries nuevas de agregación
// salvo cuando hace falta (getMarketComparison en market.ts y
// getFacilityComparison acá abajo): reusa getOverviewData (KPIs + insights
// ya resueltos por el mismo motor que usa Overview), getRegionComparison
// (region.ts, ya pensado para período arbitrario) y getMetricSeriesInWindow
// (trends.ts, para el gráfico de evolución) en vez de duplicar esa lógica.

export type ReportGranularity = "week" | "month";
export type ReportFilters = Omit<OverviewFilters, "dateFrom" | "dateTo">;

export type ReportPeriodInfo = {
  anchorISO: string;
  dateFrom: Date;
  dateTo: Date;
  label: string;
};

// ---------- Resolución de período: actual, anterior inmediato, y año pasado ----------
// Dos nociones de "anterior" conviven acá a propósito, cada una para una
// sección distinta del reporte:
//  - "prior" = el período inmediatamente anterior (semana/mes previo) — para
//    las variaciones operativas ("¿subió o bajó esta semana respecto a la
//    pasada?"), igual que "semana anterior" en los mockups que aprobó Ivan.
//  - "priorYear"/"priorYearNext" = el mismo período el año pasado, y el
//    período siguiente A ESE — para el insight estacional de "Predicción",
//    mismo criterio que buildForwardLookingInsights en app/seasonality.
// resolvePeriod ya calcula "mismo período año pasado" como
// priorDateFrom/priorDateTo (ver period.ts) — se reusa tal cual en vez de
// recalcularlo, y solo se vuelve a invocar resolvePeriod con un anchor
// desplazado para conseguir "prior" (inmediato) y "priorYearNext".
function resolveReportPeriods(granularity: ReportGranularity, anchorISO: string, locale: Locale) {
  const current = resolvePeriod(granularity, anchorISO, undefined, undefined, locale);
  // "week"/"month" siempre devuelven dateFrom/dateTo — las otras ramas de
  // Granularity (no alcanzables acá, ReportGranularity las excluye) son las
  // únicas que pueden omitirlos.
  const dateFrom = current.dateFrom!;
  const dateTo = current.dateTo!;

  const priorAnchorISO = shiftAnchor(granularity, anchorISO, -1);
  const prior = resolvePeriod(granularity, priorAnchorISO, undefined, undefined, locale);

  const priorYearDateFrom = current.priorDateFrom!;
  const priorYearDateTo = current.priorDateTo!;
  const priorYearAnchorISO = priorYearDateFrom.toISOString().slice(0, 10);

  // priorYearNext = el tramo siguiente A priorYear, el año pasado. Para
  // "month" alcanza con resolvePeriod(shiftAnchor(+1)) — priorYear YA cae en
  // un mes calendario prolijo, así que re-resolverlo da el mes calendario
  // siguiente correcto. Para "week" NO alcanza: priorYear sale de
  // shiftYears(dateFrom, -1) (restar 1 año a un lunes), y como 1 año no son
  // 52 semanas exactas (365/366 días vs. 364), el resultado casi nunca cae
  // en lunes — resolvePeriod("week", ...) IGUAL lo snappea al lunes de esa
  // semana (startOfWeek), lo que corre priorYearNext hacia atrás y lo hace
  // SOLAPARSE con priorYear en vez de empezar justo después (bug real,
  // detectado por validate_report_periods.mjs). Por eso acá se construye a
  // mano como "los 7 días inmediatos después de priorYear.dateTo", sin pasar
  // por el snapping a lunes de resolvePeriod.
  let priorYearNextDateFrom: Date;
  let priorYearNextDateTo: Date;
  let priorYearNextLabel: string;
  if (granularity === "week") {
    priorYearNextDateFrom = new Date(priorYearDateTo.getTime() + 86400000);
    priorYearNextDateTo = new Date(priorYearNextDateFrom.getTime() + 6 * 86400000);
    priorYearNextDateTo.setUTCHours(23, 59, 59, 999);
    priorYearNextLabel = priorYearNextDateFrom.toISOString().slice(0, 10);
  } else {
    const priorYearNextAnchorISO = shiftAnchor(granularity, priorYearAnchorISO, 1);
    const priorYearNext = resolvePeriod(granularity, priorYearNextAnchorISO, undefined, undefined, locale);
    priorYearNextDateFrom = priorYearNext.dateFrom!;
    priorYearNextDateTo = priorYearNext.dateTo!;
    priorYearNextLabel = priorYearNext.label;
  }

  return {
    current: { anchorISO, dateFrom, dateTo, label: current.label } satisfies ReportPeriodInfo,
    prior: { anchorISO: priorAnchorISO, dateFrom: prior.dateFrom!, dateTo: prior.dateTo!, label: prior.label } satisfies ReportPeriodInfo,
    priorYear: { anchorISO: priorYearAnchorISO, dateFrom: priorYearDateFrom, dateTo: priorYearDateTo, label: current.priorLabel ?? "" } satisfies ReportPeriodInfo,
    priorYearNext: {
      anchorISO: priorYearNextDateFrom.toISOString().slice(0, 10),
      dateFrom: priorYearNextDateFrom,
      dateTo: priorYearNextDateTo,
      label: priorYearNextLabel,
    } satisfies ReportPeriodInfo,
  };
}

// ---------- Comparación facility-vs-facility (scope = un market puntual) ----------
// Tercer escalón del drill-down de "a qué nivel mostrar la tabla de
// comparación": red completa -> por región (getRegionComparison), región
// puntual -> por market (getMarketComparison), market puntual -> por
// facility (acá). Si ya hay un facilityId elegido no hay escalón posible
// (una sola fila no es una "comparación") — ver getScopeBreakdown.
export type FacilityComparisonRow = {
  facilityId: string;
  name: string;
  confirmedGames: number;
  totalGames: number;
  changePct: number | null;
  confirmationRate: number;
  changePts: number | null;
};

async function getFacilityComparisonImpl(
  filters: Omit<OverviewFilters, "dateFrom" | "dateTo" | "facilityId">,
  dateFrom: Date,
  dateTo: Date,
  priorDateFrom: Date,
  priorDateTo: Date
): Promise<FacilityComparisonRow[]> {
  const where = buildWhere({ ...filters, dateFrom, dateTo });
  const priorWhere = buildWhere({ ...filters, dateFrom: priorDateFrom, dateTo: priorDateTo });

  const [currentGroups, priorGroups] = await Promise.all([
    prisma.game.groupBy({ by: ["facilityId", "status"], where, _count: { _all: true } }),
    prisma.game.groupBy({ by: ["facilityId", "status"], where: priorWhere, _count: { _all: true } }),
  ]);

  const facilityIds = Array.from(new Set(currentGroups.map((g) => g.facilityId)));
  type FacilityNameInfo = { id: string; name: string };
  const facilityInfo = facilityIds.length
    ? ((await prisma.facility.findMany({ where: { id: { in: facilityIds } }, select: { id: true, name: true } })) as FacilityNameInfo[])
    : [];
  const nameMap = new Map(facilityInfo.map((f): [string, string] => [f.id, f.name]));

  function tally(groups: { facilityId: string; status: GameStatus; _count: { _all: number } }[]) {
    const totals = new Map<string, { confirmed: number; total: number }>();
    for (const g of groups) {
      const entry = totals.get(g.facilityId) ?? { confirmed: 0, total: 0 };
      entry.total += Number(g._count._all);
      if (g.status === GameStatus.CONFIRMED) entry.confirmed += Number(g._count._all);
      totals.set(g.facilityId, entry);
    }
    return totals;
  }

  const current = tally(currentGroups as unknown as { facilityId: string; status: GameStatus; _count: { _all: number } }[]);
  const prior = tally(priorGroups as unknown as { facilityId: string; status: GameStatus; _count: { _all: number } }[]);

  const rows: FacilityComparisonRow[] = Array.from(current.entries()).map(([facilityId, cur]) => {
    const p = prior.get(facilityId) ?? null;
    const confirmationRate = cur.total > 0 ? cur.confirmed / cur.total : 0;
    const priorConfirmationRate = p && p.total > 0 ? p.confirmed / p.total : null;
    return {
      facilityId,
      name: nameMap.get(facilityId) ?? "—",
      confirmedGames: cur.confirmed,
      totalGames: cur.total,
      changePct: p && p.confirmed > 0 ? (cur.confirmed - p.confirmed) / p.confirmed : null,
      confirmationRate,
      changePts: priorConfirmationRate !== null ? confirmationRate - priorConfirmationRate : null,
    };
  });

  return rows.sort((a, b) => b.confirmedGames - a.confirmedGames);
}

const getFacilityComparison = cached("getFacilityComparisonForReports", getFacilityComparisonImpl);

export type ScopeBreakdown =
  | { kind: "region"; rows: RegionComparisonRow[] }
  | { kind: "market"; rows: MarketComparisonRow[] }
  | { kind: "facility"; rows: FacilityComparisonRow[] }
  | { kind: "none" };

async function getScopeBreakdown(
  filters: ReportFilters,
  dateFrom: Date,
  dateTo: Date,
  priorDateFrom: Date,
  priorDateTo: Date
): Promise<ScopeBreakdown> {
  if (filters.facilityId) return { kind: "none" };
  if (filters.marketId) {
    const rows = await getFacilityComparison(filters, dateFrom, dateTo, priorDateFrom, priorDateTo);
    return { kind: "facility", rows };
  }
  if (filters.regionId) {
    const rows = await getMarketComparison(filters, dateFrom, dateTo, priorDateFrom, priorDateTo);
    return { kind: "market", rows };
  }
  const rows = await getRegionComparison(filters, dateFrom, dateTo, priorDateFrom, priorDateTo);
  return { kind: "region", rows };
}

// ---------- Insight estacional (sección "Predicción") ----------
// Mismo criterio que buildForwardLookingInsights en app/seasonality/page.tsx,
// adaptado a un solo período (no 12 meses de una vez): compara, el año
// pasado, este mismo tramo contra EL TRAMO SIGUIENTE — "¿qué solía pasar
// justo después de este punto del año?". Null si no hay suficiente historial
// (alguno de los dos tramos del año pasado está vacío) — no se inventa una
// variación "+Infinity%" ni un insight sin base real.
function pctChange(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return (current - prior) / prior;
}

export type SeasonalInsight = { textKey: string; pct: number };

function buildSeasonalInsight(priorYear: OverviewData, priorYearNext: OverviewData): SeasonalInsight | null {
  if (priorYear.confirmedGames <= 0 || priorYearNext.confirmedGames <= 0) return null;
  const delta = pctChange(priorYearNext.confirmedGames, priorYear.confirmedGames);
  if (delta === null || Math.abs(delta) < 0.05) return null;
  return { textKey: delta >= 0 ? "seasonal.volumeUp" : "seasonal.volumeDown", pct: Math.abs(delta) * 100 };
}

// ---------- Sugerencias de acción ----------
// Reglas sobre datos YA calculados (currentData.worstCancellationRate, el
// breakdown de la sección anterior, cancellationBreakdown) — mismo criterio
// que generateOverviewInsights/buildSeasonalityInsights: nada especulativo,
// solo lo que los números ya traídos sustentan. Como mucho 4 (igual que el
// mockup) para que la sección quepa en una página.
const OUTLIER_GAP_POINTS = 15;
const BREAKDOWN_ALERT_PCT = 0.08; // -8% o más vs. período anterior se considera una caída a monitorear

export type ActionSuggestion = { textKey: string; values: Record<string, string | number> };

// ---------- Foco para el período siguiente (tendencia/récord histórico) ----------
// A diferencia de todo lo anterior (que compara el período actual contra
// UN solo punto — el anterior inmediato, o el mismo tramo el año pasado),
// esto mira la ventana completa que ya se trae para el gráfico de
// evolución (evolution: 6 semanas o 6 meses según granularidad — ver
// resolveEvolutionWindow) y busca dos patrones que sí justifican poner el
// foco ahí para el período que viene:
//  - una racha de >= MIN_STREAK períodos consecutivos moviéndose en la
//    misma dirección (p. ej. cancelación subiendo 3 semanas seguidas)
//  - el período actual siendo el peor (o el volumen más bajo) de toda la
//    ventana, aun sin una racha prolija de un período a otro
// Ninguna de las dos inventa una causa (ver nota sobre "Detalle de los
// puntos no positivos" del mockup, arriba en este archivo) — solo
// describen el patrón numérico y sugieren vigilarlo. Si se da la racha Y
// el récord a la vez (lo usual), se reporta solo la racha: es la lectura
// más informativa de las dos, y mostrar ambas sería redundante.
const MIN_HISTORY_POINTS = 4; // incluyendo el actual: al menos 3 puntos previos para que "histórico" tenga sentido
const MIN_STREAK = 3;
const CANCELLATION_STEP_EPSILON = 0.005; // 0.5pt — filtra ruido de punto flotante, no una racha real

function detectStreak(values: number[], epsilon: number): { direction: "up" | "down"; length: number } | null {
  const diffs: number[] = [];
  for (let i = 1; i < values.length; i++) diffs.push(values[i] - values[i - 1]);

  let length = 0;
  let direction: "up" | "down" | null = null;
  for (let i = diffs.length - 1; i >= 0; i--) {
    const d = diffs[i];
    if (Math.abs(d) <= epsilon) break; // un paso plano corta la racha
    const dir: "up" | "down" = d > 0 ? "up" : "down";
    if (direction === null) direction = dir;
    else if (dir !== direction) break;
    length++;
  }
  return direction && length >= MIN_STREAK ? { direction, length } : null;
}

function buildHistoricalFocus(evolution: MetricSeriesPoint[]): ActionSuggestion[] {
  if (evolution.length < MIN_HISTORY_POINTS) return [];

  const current = evolution[evolution.length - 1];
  if (current.totalGames === 0) return [];
  const history = evolution.slice(0, -1);

  const suggestions: ActionSuggestion[] = [];

  const cancelStreak = detectStreak(evolution.map((p) => p.cancellationRate), CANCELLATION_STEP_EPSILON);
  if (cancelStreak && cancelStreak.direction === "up") {
    const startValue = evolution[evolution.length - 1 - cancelStreak.length].cancellationRate;
    const avgStepPts = ((current.cancellationRate - startValue) / cancelStreak.length) * 100;
    suggestions.push({
      textKey: "actions.cancellationTrendUp",
      values: { periods: cancelStreak.length, pts: avgStepPts.toFixed(1) },
    });
  } else {
    const worstInHistory = Math.max(...history.map((p) => p.cancellationRate));
    if (current.cancellationRate > 0 && current.cancellationRate >= worstInHistory) {
      suggestions.push({ textKey: "actions.cancellationHistoricalHigh", values: { periods: history.length } });
    }
  }

  const volumeStreak = detectStreak(evolution.map((p) => p.confirmedGames), 0);
  if (volumeStreak && volumeStreak.direction === "down") {
    suggestions.push({ textKey: "actions.volumeTrendDown", values: { periods: volumeStreak.length } });
  } else {
    const lowestInHistory = Math.min(...history.map((p) => p.confirmedGames));
    if (current.confirmedGames <= lowestInHistory) {
      suggestions.push({ textKey: "actions.volumeHistoricalLow", values: { periods: history.length } });
    }
  }

  return suggestions;
}

function buildActionSuggestions(
  current: OverviewData,
  breakdown: ScopeBreakdown,
  seasonal: SeasonalInsight | null,
  evolution: MetricSeriesPoint[]
): ActionSuggestion[] {
  const suggestions: ActionSuggestion[] = [];

  if (seasonal) {
    suggestions.push({
      textKey: seasonal.textKey === "seasonal.volumeUp" ? "actions.seasonalUp" : "actions.seasonalDown",
      values: { pct: seasonal.pct.toFixed(0) },
    });
  }

  suggestions.push(...buildHistoricalFocus(evolution));

  const worst = current.worstCancellationRate[0];
  if (worst) {
    const gapPoints = (worst.rate - current.cancellationRate) * 100;
    if (gapPoints >= OUTLIER_GAP_POINTS) {
      suggestions.push({
        textKey: "actions.worstFacility",
        values: { facility: worst.label, rate: (worst.rate * 100).toFixed(0) },
      });
    }
  }

  if (breakdown.kind !== "none") {
    const rows = breakdown.rows as { changePct: number | null }[];
    const worstRow = [...rows]
      .filter((r) => r.changePct !== null && r.changePct <= -BREAKDOWN_ALERT_PCT)
      .sort((a, b) => (a.changePct as number) - (b.changePct as number))[0] as
      | (RegionComparisonRow | MarketComparisonRow | FacilityComparisonRow)
      | undefined;
    if (worstRow) {
      const name =
        "regionName" in worstRow ? worstRow.regionName : "marketName" in worstRow ? worstRow.marketName : worstRow.name;
      suggestions.push({
        textKey: "actions.monitorScope",
        values: { scope: name, pct: Math.abs((worstRow.changePct as number) * 100).toFixed(0) },
      });
    }
  }

  const topReason = current.cancellationBreakdown[0];
  if (topReason && topReason.pct > 0.35) {
    suggestions.push({
      textKey: "actions.topReason",
      values: { reason: topReason.label, pct: (topReason.pct * 100).toFixed(0) },
    });
  }

  // Hasta 6 (antes 4): con el foco histórico nuevo puede haber hasta 2
  // sugerencias más que antes — igual se limita para que la sección no
  // crezca sin tope, pero ya no recorta las de siempre a mitad de camino.
  return suggestions.slice(0, 6);
}

// ---------- Foco de la semana (detalle accionable por cancha) ----------
// A diferencia de "Detalle de los puntos no positivos" del mockup original
// (ver nota arriba de getOpsReportDataImpl) — narrativa especulativa escrita
// a mano ("sugiere un problema de mantenimiento...") — esto arma la acción
// recomendada a partir del MOTIVO DE CANCELACIÓN REAL cargado en cada
// partido (game.cancellationCategory), no de una causa inventada: el motivo
// decide la acción, mismo criterio que generateOverviewInsights/
// buildActionSuggestions ("solo lo que los números ya traídos sustentan").
//
// Siempre a nivel CANCHA puntual, aunque el reporte esté viendo la red
// completa o una región — es el nivel sobre el que alguien puede
// efectivamente actuar ("contactar a la cancha", no "a la región"). Se
// desactiva cuando el reporte YA está filtrado a una sola cancha
// (filters.facilityId): ahí no hay nada que destacar sobre sí misma.
//
// Elige hasta 3 canchas, en este orden de prioridad (se corta ni bien se
// llega a 3, y cada cancha entra una sola vez):
//  1. Mayor caída de partidos confirmados vs. el período anterior.
//  2. Peor tasa de cancelación con una brecha relevante vs. la red (mismo
//     umbral que actions.worstFacility — por eso ese ítem se saca de la
//     lista general en Ops, ver OpsReportDocument: sería la misma cancha
//     dicha dos veces).
//  3. La cancha que más explica las cancelaciones de TODA la red este
//     período (reusa paretoCancellations, ya calculado).
const FACILITY_FOCUS_DOMINANT_REASON_PCT = 0.35; // mismo umbral que actions.topReason

export type FacilityFocusItem = {
  entityLabel: string;
  findingTextKey: string;
  findingValues: Record<string, string | number>;
  reasonTextKey: string | null;
  reasonValues?: Record<string, string | number>;
  actionTextKey: string;
};

type FocusTrigger = "volumeDrop" | "cancellationHigh" | "paretoShare";
type FocusCandidate = { facilityId: string; trigger: FocusTrigger; findingValues: Record<string, string | number> };

// La categoría se trata como string simple, no como el enum de Prisma
// (CancellationCategory) — mismo criterio que shared.ts (CATEGORY_LABEL,
// labelForCancellationCategory): alcanza con que coincida con los valores
// reales que guarda la base, sin acoplar este archivo al tipo del cliente
// generado.
function actionKeyForReason(category: string): string {
  switch (category) {
    case "MAINTENANCE":
    case "FACILITY_UNAVAILABLE":
      return "facilityFocus.action.facilityIssue";
    case "NOT_ENOUGH_PLAYERS":
      return "facilityFocus.action.demand";
    case "WEATHER":
      return "facilityFocus.action.weather";
    case "HOLIDAY":
      return "facilityFocus.action.holiday";
    default:
      return "facilityFocus.action.unclear";
  }
}

async function buildFacilityFocus(
  filters: ReportFilters,
  current: OverviewData,
  dateFrom: Date,
  dateTo: Date,
  priorDateFrom: Date,
  priorDateTo: Date,
  locale: Locale
): Promise<FacilityFocusItem[]> {
  if (filters.facilityId) return []; // el reporte ya es de una sola cancha

  const facilityRows = await getFacilityComparison(filters, dateFrom, dateTo, priorDateFrom, priorDateTo);

  const candidates: FocusCandidate[] = [];
  const seen = new Set<string>();

  const worstVolume = [...facilityRows]
    .filter((r) => r.totalGames >= MIN_GAMES_FOR_RANKING && r.changePct !== null)
    .sort((a, b) => (a.changePct as number) - (b.changePct as number))[0];
  if (worstVolume && (worstVolume.changePct as number) <= -BREAKDOWN_ALERT_PCT) {
    candidates.push({
      facilityId: worstVolume.facilityId,
      trigger: "volumeDrop",
      findingValues: {
        confirmedGames: worstVolume.confirmedGames,
        changePct: Math.abs((worstVolume.changePct as number) * 100).toFixed(0),
      },
    });
    seen.add(worstVolume.facilityId);
  }

  const worstRate = current.worstCancellationRate.find(
    (f) => f.totalGames >= MIN_GAMES_FOR_RANKING && !seen.has(f.facilityId)
  );
  if (worstRate) {
    const gapPoints = (worstRate.rate - current.cancellationRate) * 100;
    if (gapPoints >= OUTLIER_GAP_POINTS) {
      candidates.push({
        facilityId: worstRate.facilityId,
        trigger: "cancellationHigh",
        findingValues: {
          rate: (worstRate.rate * 100).toFixed(0),
          gap: gapPoints.toFixed(0),
          networkRate: (current.cancellationRate * 100).toFixed(0),
        },
      });
      seen.add(worstRate.facilityId);
    }
  }

  const topContributor = current.paretoCancellations.find((p) => !seen.has(p.facilityId));
  if (topContributor && current.cancelledGames > 0) {
    const sharePct = topContributor.value / current.cancelledGames;
    if (sharePct >= FACILITY_FOCUS_DOMINANT_REASON_PCT) {
      candidates.push({
        facilityId: topContributor.facilityId,
        trigger: "paretoShare",
        findingValues: { pct: (sharePct * 100).toFixed(0), count: topContributor.value },
      });
      seen.add(topContributor.facilityId);
    }
  }

  if (candidates.length === 0) return [];

  const facilityIds = candidates.map((c) => c.facilityId);

  const [facilityInfo, reasonGroups] = await Promise.all([
    prisma.facility.findMany({
      where: { id: { in: facilityIds } },
      select: { id: true, name: true, market: { select: { name: true, region: { select: { name: true } } } } },
    }),
    // Motivo de cancelación REAL de cada cancha elegida, SOLO para esas
    // pocas canchas (no todas las de la red) — una consulta chica y puntual,
    // no el mismo costo que cancellationBreakdown a nivel red.
    prisma.game.groupBy({
      by: ["facilityId", "cancellationCategory"],
      where: { facilityId: { in: facilityIds }, status: GameStatus.CANCELLED, date: { gte: dateFrom, lte: dateTo } },
      _count: { _all: true },
    }),
  ]);

  type FacilityInfoRow = { id: string; name: string; market: { name: string; region: { name: string } | null } | null };
  const infoById = new Map((facilityInfo as FacilityInfoRow[]).map((f) => [f.id, f] as const));

  const reasonTotals = new Map<string, Map<string, number>>();
  for (const g of reasonGroups) {
    // Mismo fusionado que cancellationBreakdown en overview.ts: null (sin
    // motivo cargado) y "OTHER" son casos distintos para Prisma pero deben
    // contar juntos acá.
    const category = (g.cancellationCategory as string | null) ?? "OTHER";
    const byCategory = reasonTotals.get(g.facilityId) ?? new Map<string, number>();
    byCategory.set(category, (byCategory.get(category) ?? 0) + Number(g._count._all));
    reasonTotals.set(g.facilityId, byCategory);
  }

  function dominantReason(facilityId: string): { category: string; pct: number } | null {
    const byCategory = reasonTotals.get(facilityId);
    if (!byCategory) return null;
    const total = Array.from(byCategory.values()).reduce((a, b) => a + b, 0);
    if (total === 0) return null;
    const [category, count] = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])[0];
    const pct = count / total;
    return pct >= FACILITY_FOCUS_DOMINANT_REASON_PCT ? { category, pct } : null;
  }

  const findingTextKeyByTrigger: Record<FocusTrigger, string> = {
    volumeDrop: "facilityFocus.finding.volumeDrop",
    cancellationHigh: "facilityFocus.finding.cancellationHigh",
    paretoShare: "facilityFocus.finding.paretoShare",
  };

  return candidates.slice(0, 3).map((c) => {
    const info = infoById.get(c.facilityId);
    const entityLabel = info ? (info.market?.region ? `${info.name} (${info.market.region.name})` : info.name) : "—";
    const reason = dominantReason(c.facilityId);

    return {
      entityLabel,
      findingTextKey: findingTextKeyByTrigger[c.trigger],
      findingValues: c.findingValues,
      reasonTextKey: reason ? "facilityFocus.reason.dominant" : null,
      reasonValues: reason
        ? { reason: labelForCancellationCategory(reason.category, locale), pct: (reason.pct * 100).toFixed(0) }
        : undefined,
      actionTextKey: reason
        ? actionKeyForReason(reason.category)
        : c.trigger === "volumeDrop"
          ? "facilityFocus.action.reviewDemand"
          : "facilityFocus.action.unclear",
    };
  });
}

function resolveEvolutionWindow(granularity: ReportGranularity, dateTo: Date): { windowStart: Date; windowEnd: Date } {
  const windowStart = new Date(dateTo);
  if (granularity === "week") windowStart.setUTCDate(windowStart.getUTCDate() - 6 * 7);
  else windowStart.setUTCMonth(windowStart.getUTCMonth() - 6);
  return { windowStart, windowEnd: dateTo };
}

// ---------- KPIs con variación vs. período anterior inmediato ----------
export type ReportKpi = { value: number; priorValue: number; changePct: number | null; changePts: number | null };

function buildKpis(current: OverviewData, prior: OverviewData) {
  return {
    confirmedGames: {
      value: current.confirmedGames,
      priorValue: prior.confirmedGames,
      changePct: pctChange(current.confirmedGames, prior.confirmedGames),
      changePts: null,
    } satisfies ReportKpi,
    confirmationRate: {
      value: current.confirmationRate,
      priorValue: prior.confirmationRate,
      changePct: null,
      changePts: current.confirmationRate - prior.confirmationRate,
    } satisfies ReportKpi,
    cancellationRate: {
      value: current.cancellationRate,
      priorValue: prior.cancellationRate,
      changePct: null,
      changePts: current.cancellationRate - prior.cancellationRate,
    } satisfies ReportKpi,
    avgFillRate: {
      value: current.avgFillRate,
      priorValue: prior.avgFillRate,
      changePct: null,
      changePts: current.avgFillRate - prior.avgFillRate,
    } satisfies ReportKpi,
    totalRevenue: {
      value: current.totalRevenue,
      priorValue: prior.totalRevenue,
      changePct: pctChange(current.totalRevenue, prior.totalRevenue),
      changePts: null,
    } satisfies ReportKpi,
  };
}

export type ReportCore = {
  granularity: ReportGranularity;
  periods: ReturnType<typeof resolveReportPeriods>;
  current: OverviewData;
  prior: OverviewData;
  kpis: ReturnType<typeof buildKpis>;
  breakdown: ScopeBreakdown;
  seasonal: SeasonalInsight | null;
  actions: ActionSuggestion[];
  evolution: MetricSeriesPoint[];
  facilityFocus: FacilityFocusItem[];
};

async function buildReportCore(filters: ReportFilters, granularity: ReportGranularity, anchorISO: string, locale: Locale): Promise<ReportCore> {
  const periods = resolveReportPeriods(granularity, anchorISO, locale);
  const { windowStart, windowEnd } = resolveEvolutionWindow(granularity, periods.current.dateTo);

  const [current, prior, priorYear, priorYearNext, breakdown, evolution] = await Promise.all([
    getOverviewData({ ...filters, dateFrom: periods.current.dateFrom, dateTo: periods.current.dateTo }, locale),
    getOverviewData({ ...filters, dateFrom: periods.prior.dateFrom, dateTo: periods.prior.dateTo }, locale),
    getOverviewData({ ...filters, dateFrom: periods.priorYear.dateFrom, dateTo: periods.priorYear.dateTo }, locale),
    getOverviewData({ ...filters, dateFrom: periods.priorYearNext.dateFrom, dateTo: periods.priorYearNext.dateTo }, locale),
    getScopeBreakdown(filters, periods.current.dateFrom, periods.current.dateTo, periods.prior.dateFrom, periods.prior.dateTo),
    getMetricSeriesInWindow(filters, granularity, windowStart, windowEnd, locale),
  ]);

  const seasonal = buildSeasonalInsight(priorYear, priorYearNext);
  const actions = buildActionSuggestions(current, breakdown, seasonal, evolution);
  // Depende de current.worstCancellationRate/paretoCancellations, así que
  // corre después de que ese fetch ya resolvió — no entra en el Promise.all
  // de arriba.
  const facilityFocus = await buildFacilityFocus(
    filters,
    current,
    periods.current.dateFrom,
    periods.current.dateTo,
    periods.prior.dateFrom,
    periods.prior.dateTo,
    locale
  );

  return {
    granularity,
    periods,
    current,
    prior,
    kpis: buildKpis(current, prior),
    breakdown,
    seasonal,
    actions,
    evolution,
    facilityFocus,
  };
}

// ---------- Internal Ops Report ----------
// Todo lo que pide el mockup aprobado salvo la sección "Detalle de los
// puntos no positivos": esos párrafos eran narrativa especulativa escrita a
// mano ("sugiere un problema de mantenimiento...") que no se puede generar
// de forma responsable desde datos reales sin inventar una causa — se
// reemplaza por los insights de generateOverviewInsights (mismo motor que ya
// usa Overview), que son afirmaciones que los números sí sostienen.
async function getOpsReportDataImpl(filters: ReportFilters, granularity: ReportGranularity, anchorISO: string, locale: Locale): Promise<ReportCore> {
  return buildReportCore(filters, granularity, anchorISO, locale);
}

export const getOpsReportData = cached("getOpsReportData", getOpsReportDataImpl);

// ---------- Executive Summary ----------
// Mismo core que el Ops report (misma fuente de verdad, dos lecturas
// distintas) — el gate de acceso (solo leadership) lo resuelve la página vía
// requireLeadershipAccess, no esta función.
async function getExecutiveReportDataImpl(filters: ReportFilters, granularity: ReportGranularity, anchorISO: string, locale: Locale): Promise<ReportCore> {
  return buildReportCore(filters, granularity, anchorISO, locale);
}

export const getExecutiveReportData = cached("getExecutiveReportData", getExecutiveReportDataImpl);
