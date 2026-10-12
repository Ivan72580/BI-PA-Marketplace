import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { GAMES_DATA_TAG } from "@/app/lib/db/cache";

// Invalida el caché de consultas de la app (ver app/lib/db/cache.ts) para
// que un import recién terminado se vea sin esperar a que venza.
//
// Autorización por secret (Bearer REVALIDATE_SECRET), no por sesión: lo
// llaman los scripts de import desde la PC de Ivan. Está excluido del
// middleware de login (ver middleware.ts) precisamente por eso, así que este
// chequeo es la única barrera — sin REVALIDATE_SECRET configurado, rechaza todo.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  revalidateTag(GAMES_DATA_TAG);
  return NextResponse.json({ ok: true });
}
