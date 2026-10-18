// Registro semanal: lógica pura (sin Prisma ni hooks) compartida entre la
// página (server), el tablero (client) y las server actions.
//
// Todas las fechas viajan como "YYYY-MM-DD" y se operan en UTC: son días
// calendario, no instantes, así que no deben correrse por el huso de quien
// mira ni del servidor. "Hoy" sale de todayISO() (huso del negocio).

// La semana del registro va de viernes a jueves: el reporte se manda el
// jueves y cubre los 7 días que terminan ese día.
export const WEEK_START_DAY = 5; // 0 = domingo … 5 = viernes

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: string | null | undefined): s is string {
  if (!s || !ISO_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekStartISO(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDaysISO(iso, -((dow - WEEK_START_DAY + 7) % 7));
}

export type WeekRange = { from: string; to: string };

export function weekRange(anyDayISO: string): WeekRange {
  const from = weekStartISO(anyDayISO);
  return { from, to: addDaysISO(from, 6) };
}

const LOCALE_TAG = { es: "es-AR", en: "en-US" } as const;
type Loc = keyof typeof LOCALE_TAG;

export function formatDay(iso: string, locale: Loc, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(LOCALE_TAG[locale], { ...opts, timeZone: "UTC" });
}

// ---------- Vínculo con facility ----------
// El tema es texto libre; si coincide (sin importar mayúsculas, acentos ni
// espacios de más) con el nombre de UNA sola facility, se vincula. Si el
// nombre se repite en dos markets no se adivina: queda como texto.
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchFacilityId(topic: string | null, facilities: { id: string; name: string }[]): string | null {
  if (!topic) return null;
  const key = normalizeName(topic);
  if (!key) return null;
  const hits = facilities.filter((f) => normalizeName(f.name) === key);
  return hits.length === 1 ? hits[0].id : null;
}

// ---------- Reporte ----------
export type ReportEntry = { date: string; text: string; topic: string | null; authorName: string | null };

export type ReportLabels = {
  subject: string; // ya interpolado con el rango
  general: string; // título del grupo de notas sin tema
  byAuthor: (name: string) => string; // sufijo cuando el reporte incluye a más de una persona
};

// Arma el texto plano del reporte, agrupado por tema (o facility). Orden de
// los grupos: primero los que tienen más notas (lo que más pasó en la
// semana arriba), desempate alfabético; "General" (sin tema) al final.
// Dentro de cada grupo, orden cronológico. Sin IA: es una agrupación fiel a
// lo que se anotó, para editar antes de mandar.
export function buildReport(entries: ReportEntry[], labels: ReportLabels, locale: Loc): string {
  const groups = new Map<string, { title: string; items: ReportEntry[] }>();
  const NO_TOPIC = "\u0000";
  for (const e of entries) {
    const title = e.topic?.trim() || "";
    const key = title ? normalizeName(title) : NO_TOPIC;
    if (!groups.has(key)) groups.set(key, { title: title || labels.general, items: [] });
    groups.get(key)!.items.push(e);
  }
  const ordered = [...groups.entries()]
    .sort(([ka, a], [kb, b]) => {
      if (ka === NO_TOPIC) return 1;
      if (kb === NO_TOPIC) return -1;
      return b.items.length - a.items.length || a.title.localeCompare(b.title);
    })
    .map(([, g]) => g);

  const authors = new Set(entries.map((e) => e.authorName ?? ""));
  const showAuthor = authors.size > 1;

  const lines: string[] = [labels.subject, ""];
  for (const g of ordered) {
    lines.push(g.title.toUpperCase());
    for (const e of [...g.items].sort((a, b) => a.date.localeCompare(b.date))) {
      const day = formatDay(e.date, locale, { weekday: "short", day: "numeric", month: "short" });
      const text = e.text.replace(/\s*\n\s*/g, " ").trim();
      const who = showAuthor && e.authorName ? ` ${labels.byAuthor(e.authorName)}` : "";
      lines.push(`• ${day}: ${text}${who}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export const MAX_TEXT_LENGTH = 4000;
export const MAX_TOPIC_LENGTH = 120;
