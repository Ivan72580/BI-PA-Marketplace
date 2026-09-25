import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/db/users";
import { isAppModule, MODULE_COOKIE } from "../lib/module";

// Único destino del redirectTo de signInGoogle.ts — ningún link ni nav de
// la app apunta acá, así que llegar a esta ruta siempre significa "recién
// inició sesión". Por eso puede redirigir según la última elección sin
// arriesgarse a interrumpir una navegación normal (a diferencia de poner
// esta misma lógica directamente en "/", que sí se visita todo el tiempo
// desde el nav).
//
// Regla: sin permiso de Executive, siempre a Magic (igual que hoy). Con
// permiso, a donde estuvo la última vez — cookie primero (no depende de la
// consulta a User, disponible desde el primer request), User.lastModule
// como respaldo si la cookie no está (dispositivo nuevo, sesión vieja).
export default async function EntradaPage() {
  const [user, cookieStore] = await Promise.all([getCurrentUser(), cookies()]);

  if (!user?.canViewLeadership) redirect("/");

  const cookieValue = cookieStore.get(MODULE_COOKIE)?.value;
  const lastModule = isAppModule(cookieValue) ? cookieValue : user.lastModule;

  redirect(lastModule === "EXECUTIVE" ? "/panel-ejecutivo" : "/");
}
