"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "../auth";
import { prisma } from "../db/prisma";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";

// Guarda el idioma elegido: siempre en la cookie (para que funcione sin
// login), y además en User.locale si hay sesión activa, para que la
// preferencia viaje con la cuenta entre dispositivos. El upsert está en
// try/catch: si todavía no se aplicó la migración de Prisma (tabla
// inexistente) el cambio de idioma no debe fallar — ya quedó guardado en
// la cookie.
export async function setLocale(locale: Locale) {
  if (!isLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const session = await auth();
  const email = session?.user?.email;
  if (email) {
    try {
      // update-only: si el signIn callback todavía no llegó a crear la fila
      // (carrera rarísima, o usuario preexistente antes de esta migración)
      // no queremos crear un User a medias sin nombre/rol acá.
      await prisma.user.update({
        where: { email },
        data: { locale },
      });
    } catch {
      // Ver comentario arriba.
    }
  }

  revalidatePath("/", "layout");
}
