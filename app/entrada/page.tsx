import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserWithAccess } from "../lib/db/users";
import { firstAccessibleHome, hasLevel, isAppModule, MODULES, MODULE_COOKIE } from "../lib/module";

// Único destino del redirectTo de signInGoogle.ts — ningún link ni nav de
// la app apunta acá, así que llegar a esta ruta siempre significa "recién
// inició sesión". Por eso puede redirigir según la última elección sin
// arriesgarse a interrumpir una navegación normal (a diferencia de poner
// esta misma lógica directamente en "/", que sí se visita todo el tiempo
// desde el nav).
//
// Regla: al último módulo que visitó, si todavía tiene acceso — cookie
// primero (disponible desde el primer request), User.lastModule como
// respaldo (dispositivo nuevo, sesión vieja). Si no, al primer módulo que
// pueda ver; si no puede ver ninguno, /sin-acceso.
export default async function EntradaPage() {
  const [current, cookieStore] = await Promise.all([getCurrentUserWithAccess(), cookies()]);
  if (!current) redirect("/");

  const cookieValue = cookieStore.get(MODULE_COOKIE)?.value;
  const last = isAppModule(cookieValue) ? cookieValue : current.user.lastModule;

  if (isAppModule(last) && hasLevel(current.access[last], "VIEW")) redirect(MODULES[last].home);
  redirect(firstAccessibleHome(current.access) ?? "/sin-acceso");
}
