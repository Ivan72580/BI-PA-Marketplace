import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/db/prisma";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

// Resolución de idioma, en orden de prioridad:
//   1. Preferencia guardada en UserPreference, si hay sesión activa.
//   2. Cookie "locale" (usuario no logueado, o logueado pero sin preferencia
//      guardada todavía).
//   3. Español por defecto.
// El lookup a UserPreference está en try/catch a propósito: si todavía no
// se aplicó la migración de Prisma (tabla inexistente) o la DB no responde,
// no debe romper el render de toda la app — simplemente se sigue con la
// cookie/default.
async function resolveLocale(): Promise<Locale> {
  const session = await auth();
  const email = session?.user?.email;

  if (email) {
    try {
      const pref = await prisma.userPreference.findUnique({ where: { email } });
      if (pref && isLocale(pref.locale)) return pref.locale;
    } catch {
      // Ver comentario arriba — se ignora y se sigue con la cookie.
    }
  }

  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;

  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
