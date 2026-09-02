export { auth as middleware } from "@/app/lib/auth";

export const config = {
  // Node.js en vez de Edge (estable desde Next 15.5): así jose (usado por
  // NextAuth para las sesiones) tiene disponibles las APIs que necesita —
  // en Edge Runtime fallaba con "CompressionStream no soportado".
  runtime: "nodejs",
  // Protege todo excepto los endpoints de auth, assets estáticos y /login.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)"],
};
