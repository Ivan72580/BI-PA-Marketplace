import { unstable_cache } from "next/cache";

// La herramienta se actualiza cuando alguien corre el import manual del CSV,
// no en tiempo real — así que cachear resultados 30 minutos es un buen
// balance: evita recalcular todo en cada click/pestaña/usuario, sin mostrar
// datos desactualizados: tras un import se puede invalidar al instante.
const REVALIDATE_SECONDS = 1800;

// Tag común para invalidar todo el caché de golpe con revalidateTag. Lo usan
// POST /api/revalidate (llamado al terminar un import, ver scripts/lib/revalidate.ts)
// y el botón "Actualizar datos ahora" de /admin/users.
export const GAMES_DATA_TAG = "games-data";

export function cached<Args extends unknown[], T>(
  keyPrefix: string,
  fn: (...args: Args) => Promise<T>
): (...args: Args) => Promise<T> {
  return unstable_cache(fn, [keyPrefix], {
    revalidate: REVALIDATE_SECONDS,
    tags: [GAMES_DATA_TAG],
  });
}

// Caché SEMANAL para listas de planificación que no deberían cambiar a cada import
// (ej. "A agendar"): se renueva sola cada lunes porque la semana ISO va en los argumentos
// de la función (parte de la clave), y vence a los 7 días por las dudas. A propósito NO usa
// GAMES_DATA_TAG: la invalidación automática post-import no la toca. Solo el botón manual
// "Actualizar datos ahora" también invalida SCHEDULE_TAG.
export const SCHEDULE_TAG = "schedule-weekly";
const WEEKLY_SECONDS = 7 * 24 * 60 * 60;

export function cachedWeekly<Args extends unknown[], T>(
  keyPrefix: string,
  fn: (...args: Args) => Promise<T>
): (...args: Args) => Promise<T> {
  return unstable_cache(fn, [keyPrefix], { revalidate: WEEKLY_SECONDS, tags: [SCHEDULE_TAG] });
}
