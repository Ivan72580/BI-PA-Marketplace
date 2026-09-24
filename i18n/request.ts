import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/db/prisma";
import { defaultLocale, isLocale, LOCALE_COOKIE, preferredBrowserLocale, type Locale } from "./config";

// Resolución de idioma, en orden de prioridad:
//   1. Preferencia guardada en User.locale, si hay sesión activa.
//   2. Cookie "locale" (usuario no logueado, o logueado pero sin preferencia
//      guardada todavía).
//   3. Idioma del navegador (header Accept-Language) — cubre la primera
//      visita, antes de que exista sesión o cookie alguna.
//   4. Español por defecto, si ninguno de los idiomas pedidos por el
//      navegador está soportado.
// El lookup a User está en try/catch a propósito: si todavía no se aplicó
// la migración de Prisma (tabla inexistente) o la DB no responde, no debe
// romper el render de toda la app — simplemente se sigue con la
// cookie/navegador/default.
async function resolveLocale(): Promise<Locale> {
  const session = await auth();
  const email = session?.user?.email;

  if (email) {
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && isLocale(user.locale)) return user.locale;
    } catch {
      // Ver comentario arriba — se ignora y se sigue con la cookie.
    }
  }

  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;

  const browserLocale = preferredBrowserLocale((await headers()).get("accept-language"));
  if (browserLocale) return browserLocale;

  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
