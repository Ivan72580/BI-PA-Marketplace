import { getLocale } from "next-intl/server";
import LeadershipOverview, { type LeadershipSP } from "../components/LeadershipOverview";
import type { Locale } from "@/i18n/config";

// El chequeo de acceso ahora vive una sola vez en layout.tsx (envuelve esta
// página y las demás del cluster /panel-ejecutivo) en vez de repetirse aquí.
// searchParams reemplaza al viejo month={todayYearMonth()} fijo — filtros de
// región/market/granularidad/período ahora viven en la URL, mismo patrón
// que Market/Daily/Trends/Forecast.
export default async function PanelEjecutivoOverviewPage({ searchParams }: { searchParams: Promise<LeadershipSP> }) {
  const [locale, sp] = await Promise.all([getLocale(), searchParams]);
  return <LeadershipOverview sp={sp} locale={locale as Locale} />;
}
