"use server";

import { signIn } from "../auth";

// Server action separada (mismo criterio que signOut.ts) porque se pasa
// como prop a un Client Component (LoginCard).
export async function signInWithGoogleAction() {
  await signIn("google", { redirectTo: "/" });
}
