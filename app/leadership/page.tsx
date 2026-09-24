import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireLeadershipAccess } from "../lib/db/users";
import LeadershipOverview from "../components/LeadershipOverview";
import type { Locale } from "@/i18n/config";

function todayYearMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function LeadershipPage() {
  const [access, locale] = await Promise.all([requireLeadershipAccess(), getLocale()]);
  if (!access) redirect("/");

  return <LeadershipOverview month={todayYearMonth()} locale={locale as Locale} />;
}
