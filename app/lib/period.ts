import type { Locale } from "@/i18n/config";

export type Granularity = "all" | "year" | "semester" | "quarter" | "month" | "week" | "day" | "custom";

export type ResolvedPeriod = {
  dateFrom?: Date;
  dateTo?: Date;
  label: string;
  priorDateFrom?: Date;
  priorDateTo?: Date;
  priorLabel: string | null;
};

const MONTH_NAMES: Record<Locale, string[]> = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

// Textos de esta función usados en Overview, Trends y FilterPanel (los tres
// consumidores de resolvePeriod/shiftAnchor). No van a messages/*.json porque
// este archivo no pertenece a ninguna página puntual — mismo criterio que
// app/lib/db/weekday.ts, que ya sigue este patrón para nombres de día.
function allTimeLabel(locale: Locale): string {
  return locale === "en" ? "All-time" : "Todo el histórico";
}
function equivalentPriorRangeLabel(locale: Locale, from: string, to: string): string {
  return locale === "en" ? `equivalent prior period (${from} – ${to})` : `período anterior equivalente (${from} – ${to})`;
}
function semesterLabel(locale: Locale, half: 1 | 2, y: number): string {
  return locale === "en" ? `${half === 1 ? "1st" : "2nd"} half ${y}` : `${half === 1 ? "1er" : "2do"} semestre ${y}`;
}
function quarterLabel(locale: Locale, q: number, y: number): string {
  return `${locale === "en" ? "Q" : "T"}${q} ${y}`;
}
function weekOfLabel(locale: Locale, dateStr: string): string {
  return locale === "en" ? `Week of ${dateStr}` : `Semana del ${dateStr}`;
}
function equivalentWeekLabel(locale: Locale, year: number): string {
  return locale === "en" ? `Equivalent week, ${year}` : `Semana equivalente, ${year}`;
}
function sameDayLabel(locale: Locale, year: number): string {
  return locale === "en" ? `same day, ${year}` : `mismo día, ${year}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDate(d: Date) {
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function startOfWeek(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0 = domingo
  const diff = (day === 0 ? -6 : 1) - day; // mover a lunes
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function endOfDay(d: Date): Date {
  const date = new Date(d);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function shiftYears(d: Date, n: number): Date {
  const date = new Date(d);
  date.setUTCFullYear(date.getUTCFullYear() + n);
  return date;
}

// El "ancla" es el punto dentro del período que se está mirando (ej: cualquier
// día de agosto 2026 si granularity="month"). Se guarda como YYYY-MM-DD en la URL.
// Para "custom", customFrom/customTo son el rango elegido directamente.
export function resolvePeriod(
  granularity: Granularity,
  anchorISO?: string,
  customFrom?: string,
  customTo?: string,
  locale: Locale = "es"
): ResolvedPeriod {
  const anchor = anchorISO ? new Date(`${anchorISO}T00:00:00Z`) : new Date();

  if (granularity === "all") {
    return { label: allTimeLabel(locale), priorLabel: null };
  }

  if (granularity === "custom") {
    if (!customFrom || !customTo) {
      return { label: allTimeLabel(locale), priorLabel: null };
    }
    const dateFrom = new Date(`${customFrom}T00:00:00Z`);
    const dateTo = endOfDay(new Date(`${customTo}T00:00:00Z`));
    const daySpan = Math.max(1, Math.round((dateTo.getTime() - dateFrom.getTime()) / 86400000) + 1);
    const priorDateTo = new Date(dateFrom.getTime() - 86400000);
    const priorDateFrom = new Date(priorDateTo.getTime() - (daySpan - 1) * 86400000);
    return {
      dateFrom,
      dateTo,
      label: `${formatDate(dateFrom)} – ${formatDate(dateTo)}`,
      priorDateFrom,
      priorDateTo: endOfDay(priorDateTo),
      priorLabel: equivalentPriorRangeLabel(locale, formatDate(priorDateFrom), formatDate(priorDateTo)),
    };
  }

  if (granularity === "year") {
    const y = anchor.getUTCFullYear();
    const dateFrom = new Date(Date.UTC(y, 0, 1));
    const dateTo = endOfDay(new Date(Date.UTC(y, 11, 31)));
    return {
      dateFrom,
      dateTo,
      label: `${y}`,
      priorDateFrom: shiftYears(dateFrom, -1),
      priorDateTo: shiftYears(dateTo, -1),
      priorLabel: `${y - 1}`,
    };
  }

  if (granularity === "semester") {
    const y = anchor.getUTCFullYear();
    const h = anchor.getUTCMonth() < 6 ? 0 : 1;
    const dateFrom = new Date(Date.UTC(y, h * 6, 1));
    const dateTo = endOfDay(new Date(Date.UTC(y, h * 6 + 6, 0)));
    return {
      dateFrom,
      dateTo,
      label: semesterLabel(locale, h === 0 ? 1 : 2, y),
      priorDateFrom: shiftYears(dateFrom, -1),
      priorDateTo: shiftYears(dateTo, -1),
      priorLabel: semesterLabel(locale, h === 0 ? 1 : 2, y - 1),
    };
  }

  if (granularity === "quarter") {
    const y = anchor.getUTCFullYear();
    const q = Math.floor(anchor.getUTCMonth() / 3);
    const dateFrom = new Date(Date.UTC(y, q * 3, 1));
    const dateTo = endOfDay(new Date(Date.UTC(y, q * 3 + 3, 0)));
    return {
      dateFrom,
      dateTo,
      label: quarterLabel(locale, q + 1, y),
      priorDateFrom: shiftYears(dateFrom, -1),
      priorDateTo: shiftYears(dateTo, -1),
      priorLabel: quarterLabel(locale, q + 1, y - 1),
    };
  }

  if (granularity === "month") {
    const y = anchor.getUTCFullYear();
    const m = anchor.getUTCMonth();
    const dateFrom = new Date(Date.UTC(y, m, 1));
    const dateTo = endOfDay(new Date(Date.UTC(y, m + 1, 0)));
    const monthNames = MONTH_NAMES[locale] ?? MONTH_NAMES.es;
    return {
      dateFrom,
      dateTo,
      label: `${monthNames[m]} ${y}`,
      priorDateFrom: shiftYears(dateFrom, -1),
      priorDateTo: shiftYears(dateTo, -1),
      priorLabel: `${monthNames[m]} ${y - 1}`,
    };
  }

  if (granularity === "week") {
    const dateFrom = startOfWeek(anchor);
    const dateTo = endOfDay(new Date(dateFrom.getTime() + 6 * 86400000));
    return {
      dateFrom,
      dateTo,
      label: weekOfLabel(locale, formatDate(dateFrom)),
      priorDateFrom: shiftYears(dateFrom, -1),
      priorDateTo: shiftYears(dateTo, -1),
      priorLabel: equivalentWeekLabel(locale, dateFrom.getUTCFullYear() - 1),
    };
  }

  // day
  const dateFrom = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
  const dateTo = endOfDay(dateFrom);
  return {
    dateFrom,
    dateTo,
    label: formatDate(dateFrom),
    priorDateFrom: shiftYears(dateFrom, -1),
    priorDateTo: shiftYears(dateTo, -1),
    priorLabel: sameDayLabel(locale, dateFrom.getUTCFullYear() - 1),
  };
}

export function shiftAnchor(granularity: Granularity, anchorISO: string, direction: 1 | -1): string {
  const anchor = new Date(`${anchorISO}T00:00:00Z`);
  switch (granularity) {
    case "year":
      anchor.setUTCFullYear(anchor.getUTCFullYear() + direction);
      break;
    case "semester":
      anchor.setUTCMonth(anchor.getUTCMonth() + direction * 6);
      break;
    case "quarter":
      anchor.setUTCMonth(anchor.getUTCMonth() + direction * 3);
      break;
    case "month":
      anchor.setUTCMonth(anchor.getUTCMonth() + direction);
      break;
    case "week":
      anchor.setUTCDate(anchor.getUTCDate() + direction * 7);
      break;
    case "day":
      anchor.setUTCDate(anchor.getUTCDate() + direction);
      break;
    default:
      break;
  }
  return anchor.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Ventana y unidad de bucket para el gráfico de "evolución", adaptada a la
// granularidad activa:
//  - all / year        -> mensual, último año
//  - semester/quarter/month -> semanal, últimos 6 meses
//  - week / day         -> semanal, últimas 6 semanas
export function resolveEvolutionWindow(
  granularity: Granularity,
  periodDateTo?: Date
): { unit: "week" | "month"; windowStart: Date; windowEnd: Date } {
  const windowEnd = periodDateTo ?? new Date();

  if (granularity === "all" || granularity === "year") {
    const windowStart = new Date(windowEnd);
    windowStart.setUTCMonth(windowStart.getUTCMonth() - 12);
    return { unit: "month", windowStart, windowEnd };
  }

  if (granularity === "week" || granularity === "day") {
    const windowStart = new Date(windowEnd);
    windowStart.setUTCDate(windowStart.getUTCDate() - 6 * 7);
    return { unit: "week", windowStart, windowEnd };
  }

  // semester, quarter, month
  const windowStart = new Date(windowEnd);
  windowStart.setUTCMonth(windowStart.getUTCMonth() - 6);
  return { unit: "week", windowStart, windowEnd };
}
