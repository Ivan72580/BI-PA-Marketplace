import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithAccess } from "../lib/db/users";
import { firstAccessibleHome } from "../lib/module";

// Destino de gateModule cuando la cuenta no puede ver ningún módulo. Fuera
// de todo módulo a propósito (si no, el redirect sería circular).
export default async function NoAccessPage() {
  const [current, t] = await Promise.all([getCurrentUserWithAccess(), getTranslations("Modules")]);
  // Si mientras tanto un Admin le dio acceso, no tiene sentido quedarse acá.
  const home = current ? firstAccessibleHome(current.access) : null;
  if (home) redirect(home);

  return (
    <div className="max-w-lg mx-auto mt-16 rounded-2xl bg-surface shadow-sm p-6">
      <h1 className="font-display text-xl font-bold text-ink mb-2">{t("noAccess.title")}</h1>
      <p className="text-sm text-ink-muted">{t("noAccess.body")}</p>
    </div>
  );
}
