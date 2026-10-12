import fs from "fs";
import path from "path";

// Avisa a la app desplegada que invalide el caché de consultas
// (GAMES_DATA_TAG), así los datos recién importados se ven enseguida en vez
// de esperar a que venza el caché (30 min).
//
// Es OPCIONAL y nunca rompe el import: si falta REVALIDATE_URL o
// REVALIDATE_SECRET, o si el pedido falla, solo avisa por consola y sigue.
//
// Variables (en .env del repo o en la terminal; la terminal tiene prioridad):
//   REVALIDATE_URL    = https://tu-app.vercel.app/api/revalidate
//   REVALIDATE_SECRET = el mismo valor que está en Vercel

function readEnvFile(name: string): string | undefined {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env"), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`));
      if (m) return m[1].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // sin .env: se usa solo process.env
  }
  return undefined;
}

export async function notifyRevalidate(): Promise<void> {
  const url = process.env.REVALIDATE_URL ?? readEnvFile("REVALIDATE_URL");
  const secret = process.env.REVALIDATE_SECRET ?? readEnvFile("REVALIDATE_SECRET");
  if (!url || !secret) {
    console.log("Caché de la app: sin REVALIDATE_URL/REVALIDATE_SECRET, no se invalida (los datos se verán al vencer el caché, ≤30 min).");
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15000),
    });
    console.log(res.ok ? "Caché de la app invalidado: los datos nuevos se ven ya." : `Caché de la app: la invalidación respondió ${res.status} (el import igual terminó bien).`);
  } catch (e) {
    console.log(`Caché de la app: no se pudo invalidar (${e instanceof Error ? e.message : String(e)}). El import igual terminó bien.`);
  }
}
