import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Restringe el login a un dominio de Google Workspace específico.
// Si no se configura ALLOWED_GOOGLE_DOMAIN, no se restringe (útil en desarrollo local).
const ALLOWED_DOMAIN = process.env.ALLOWED_GOOGLE_DOMAIN;

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (!ALLOWED_DOMAIN) return true;
      const email = profile?.email ?? "";
      return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN.toLowerCase()}`);
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
