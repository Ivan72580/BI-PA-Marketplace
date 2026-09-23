import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "./db/prisma";

// Restringe el login a un dominio de Google Workspace específico.
// Si no se configura ALLOWED_GOOGLE_DOMAIN, no se restringe (útil en desarrollo local).
const ALLOWED_DOMAIN = process.env.ALLOWED_GOOGLE_DOMAIN;

// Emails que arrancan como ADMIN la primera vez que inician sesión.
// Solo importa en ese primer login de cada cuenta — a partir de ahí, los
// cambios de rol se hacen desde /admin/users, no editando esta variable.
const SEED_ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .toLowerCase()
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const email = (profile?.email ?? "").toLowerCase();
      if (!email) return false;
      if (ALLOWED_DOMAIN && !email.endsWith(`@${ALLOWED_DOMAIN.toLowerCase()}`)) {
        return false;
      }

      // Alta/actualización de la cuenta de negocio. En try/catch a propósito:
      // si todavía no se aplicó la migración de Prisma (tabla inexistente)
      // no debe bloquear el login — mismo criterio defensivo que ya se usa
      // en app/lib/actions/locale.ts e i18n/request.ts.
      try {
        await prisma.user.upsert({
          where: { email },
          update: {
            name: profile?.name ?? undefined,
            image: (profile as { picture?: string } | undefined)?.picture ?? undefined,
            lastLoginAt: new Date(),
          },
          create: {
            email,
            name: profile?.name,
            image: (profile as { picture?: string } | undefined)?.picture,
            role: SEED_ADMIN_EMAILS.has(email) ? "ADMIN" : "MEMBER",
            lastLoginAt: new Date(),
          },
        });
      } catch {
        // Ver comentario arriba.
      }

      return true;
    },
    // Este es el que de verdad bloquea el acceso: sin él, "auth as middleware"
    // solo adjunta la sesión al pedido pero no redirige a nadie a /login.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  pages: {
    signIn: "/login",
  },
});
