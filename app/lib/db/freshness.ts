import { prisma } from "./prisma";
import { cached } from "./cache";
import { todayISO } from "../period";

// Fecha del último partido ya jugado que está cargado en la base ("datos
// hasta"). Sirve para dos cosas: el indicador discreto de la barra superior
// y fijar hasta qué día cuenta la proyección del mes (los días sin importar
// no son días sin partidos, son días sin datos). Se limita a hoy para que un
// partido futuro cargado de antemano no haga parecer los datos más frescos.
async function getLatestDataDateImpl(today: string): Promise<string | null> {
  const res = await prisma.game.aggregate({
    _max: { date: true },
    where: { date: { lte: new Date(`${today}T00:00:00.000Z`) } },
  });
  return res._max.date ? res._max.date.toISOString().slice(0, 10) : null;
}

const getLatestDataDateCached = cached("getLatestDataDate", getLatestDataDateImpl);

// `today` entra como argumento a propósito: es parte de la clave del caché,
// así no se queda pegado el resultado de ayer pasada la medianoche.
export function getLatestDataDate(): Promise<string | null> {
  return getLatestDataDateCached(todayISO());
}
