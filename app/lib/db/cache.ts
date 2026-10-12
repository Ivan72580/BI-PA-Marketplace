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
