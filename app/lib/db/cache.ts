import { unstable_cache } from "next/cache";

// La herramienta se actualiza cuando alguien corre el import manual del CSV,
// no en tiempo real — así que cachear resultados unos minutos es un buen
// balance: evita recalcular todo en cada click/pestaña/usuario, sin mostrar
// datos desactualizados por mucho tiempo después de una sincronización nueva.
const REVALIDATE_SECONDS = 300;

// Tag común para poder invalidar todo el caché de golpe con revalidateTag("games-data")
// el día que conectemos el import a un endpoint de invalidación (ver SETUP.md).
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
