"use server";

import { signOut } from "../auth";

// Server action separada (en vez de una función inline dentro de UserMenu)
// porque ahora se pasa como prop a un Client Component (UserMenuDropdown) —
// Next.js necesita una referencia a una acción exportada de un módulo "use
// server" para poder serializarla correctamente al pasarla al cliente.
export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
