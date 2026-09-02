export { auth as middleware } from "@/app/lib/auth";

export const config = {
  // Protege todo excepto los endpoints de auth, assets estáticos y /login.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)"],
};
