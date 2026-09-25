"use server";

import { signIn } from "../auth";

// Server action separada (mismo criterio que signOut.ts) porque se pasa
// como prop a un Client Component (LoginCard).
export async function signInWithGoogleAction() {
  // "/entrada" decide a dónde va cada uno según su último módulo (Magic vs.
  // Executive) — ver app/entrada/page.tsx. No es el destino final, es el
  // único lugar que necesita saber que "venimos de loguearnos ahora mismo".
  await signIn("google", { redirectTo: "/entrada" });
}
