import { getLocale } from "next-intl/server";
import LeadershipOverview from "../components/LeadershipOverview";
import type { Locale } from "@/i18n/config";

function todayYearMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// El chequeo de acceso ahora vive una sola vez en layout.tsx (envuelve esta
// página y las demás del cluster /panel-ejecutivo) en vez de repetirse aquí.
export default async function PanelEjecutivoOverviewPage() {
  const locale = await getLocale();
  return <LeadershipOverview month={todayYearMonth()} locale={locale as Locale} />;
}
