"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "./LanguageSwitcher";
import type { Locale } from "@/i18n/config";

export default function UserMenuDropdown({
  displayName,
  email,
  initials,
  locale,
  isAdmin,
  hasSession,
  signOutAction,
}: {
  displayName: string;
  email: string | null;
  initials: string;
  locale: Locale;
  isAdmin: boolean;
  hasSession: boolean;
  signOutAction: () => Promise<void>;
}) {
  const t = useTranslations("UserMenu");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Cierra al hacer click afuera o con Escape — patrón estándar de dropdown,
  // sin librería: un listener en document mientras está abierto, nada más.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={displayName}
        aria-label={displayName}
        aria-expanded={open}
        className="w-8 h-8 rounded-full bg-accent text-[#0b3b2e] flex items-center justify-center text-xs font-bold shrink-0"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-56 rounded-xl bg-[#0b3b2e] border border-white/10 shadow-xl py-2 z-50">
          <div className="px-3 pb-2 mb-1 border-b border-white/10">
            <div className="text-sm font-medium text-white truncate">{displayName}</div>
            {email && <div className="text-xs text-white/50 truncate">{email}</div>}
          </div>

          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs text-white/70">{t("language")}</span>
            <LanguageSwitcher locale={locale} />
          </div>

          {isAdmin && (
            <Link
              href="/admin/users"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {t("adminLink")}
            </Link>
          )}

          {hasSession && (
            <div className="border-t border-white/10 mt-1 pt-1">
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 transition-colors text-left"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  {t("signOut")}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
