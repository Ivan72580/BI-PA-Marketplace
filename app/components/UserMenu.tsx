import { getLocale, getTranslations } from "next-intl/server";
import { auth, signOut } from "../lib/auth";
import LanguageSwitcher from "./LanguageSwitcher";
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
  const [session, locale, t] = await Promise.all([
    auth(),
    getLocale(),
    getTranslations("UserMenu"),
  ]);
  const initials = getInitials(session?.user?.name, session?.user?.email);
  const displayName = session?.user?.name ?? session?.user?.email ?? t("guest");

  return (
    <div className="flex items-center gap-2">
      <LanguageSwitcher locale={locale as Locale} />
      <div className="flex items-center gap-1.5">
        <div
          title={displayName}
          className="w-8 h-8 rounded-full bg-accent text-[#0b3b2e] flex items-center justify-center text-xs font-bold shrink-0"
        >
          {initials}
        </div>
        {session && (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              title={t("signOut")}
              aria-label={t("signOut")}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
