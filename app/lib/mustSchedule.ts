// =====================================================================================
// Definición única del "sí o sí" (partido que conviene agendar), compartida por Daily,
// la vista "A agendar" de Inventario y la lectura de Estacionalidad.
//
// Un slot es "sí o sí" cuando, en la VENTANA RECIENTE, su tasa de demanda supera el piso y
// tiene muestra suficiente:
//   tasa de demanda = confirmados / (confirmados + cancelados por falta de jugadores)
//   (ver metrics.ts: cancha no disponible, operativas y plugin no entran al cálculo)
//
// Nota: "consistencia" en Trends (% de meses en que el slot existió) es OTRA cosa — mide
// recurrencia (¿se publica todos los meses?), no si se confirma. No se mezcla con esto.
// =====================================================================================

export const MUST_SCHEDULE_WINDOW_MONTHS = 3;
export const MUST_SCHEDULE_MIN_RATE = 0.55;
export const MUST_SCHEDULE_MIN_SAMPLE = 3; // partidos con base de demanda dentro de la ventana

/** ¿La tasa de demanda supera el piso del "sí o sí"? (estricto, igual que Daily). */
export function isDemandHealthy(rate: number | null): boolean {
  return rate !== null && rate > MUST_SCHEDULE_MIN_RATE;
}

/** ¿Un slot con esta muestra y tasa califica como "sí o sí"? */
export function qualifiesMustSchedule(demandBase: number, rate: number | null): boolean {
  return demandBase >= MUST_SCHEDULE_MIN_SAMPLE && isDemandHealthy(rate);
}

/** Fecha de inicio de la ventana de N meses que termina en `endISO` (inclusive). */
export function windowStartISO(endISO: string, months = MUST_SCHEDULE_WINDOW_MONTHS): string {
  const e = new Date(`${endISO}T00:00:00Z`);
  return new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - months, e.getUTCDate() + 1)).toISOString().slice(0, 10);
}

/** Clave de semana ISO (YYYY-Www): hace que un caché "semanal" se renueve solo cada lunes. */
export function isoWeekKey(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow + 3); // jueves de esa semana
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
