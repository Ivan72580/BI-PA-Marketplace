import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "../lib/auth";
import { getCurrentUser } from "../lib/db/users";
import { signOutAction } from "../lib/actions/signOut";
import UserMenuDropdown from "./UserMenuDropdown";
import type { Locale } from "@/i18n/config";

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

export default async function UserMenu() {
  const [session, locale, t, currentUser] = await Promise.all([
    auth(),
    getLocale(),
    getTranslations("UserMenu"),
    getCurrentUser(),
  ]);
  const initials = getInitials(session?.user?.name, session?.user?.email);
  const displayName = session?.user?.name ?? session?.user?.email ?? t("guest");
  const isAdmin = currentUser?.role === "ADMIN";

  return (
    <UserMenuDropdown
      displayName={displayName}
      email={session?.user?.email ?? null}
      initials={initials}
      locale={locale as Locale}
      isAdmin={isAdmin}
      hasSession={!!session}
      signOutAction={signOutAction}
    />
  );
}
