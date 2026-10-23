"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { themes, type Theme } from "../lib/theme";
import { applyTheme } from "../lib/themeClient";

// Selector Sistema | Claro | Oscuro, mismo pill que LanguageSwitcher. Vive en
// el menú de usuario. A diferencia del idioma, no pasa por el servidor: el
// cambio se aplica al instante en el <html> y la cookie queda para el
// próximo render del servidor (ver app/lib/theme.ts).
const LABEL_KEY: Record<Theme, "themeSystem" | "themeLight" | "themeDark"> = {
  system: "themeSystem",
  light: "themeLight",
  dark: "themeDark",
};

export default function ThemeSwitcher({ initialTheme }: { initialTheme: Theme }) {
  const t = useTranslations("UserMenu");
  const [theme, setTheme] = useState<Theme>(initialTheme);

  function handleSelect(next: Theme) {
    if (next === theme) return;
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div className="inline-flex items-center rounded-full bg-surface-panel p-0.5 text-[11px] font-semibold gap-0.5">
      {themes.map((th) => (
        <button
          key={th}
          type="button"
          onClick={() => handleSelect(th)}
          aria-pressed={theme === th}
          className={`px-2 py-1 rounded-full transition-colors ${
            theme === th ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
          }`}
        >
          {t(LABEL_KEY[th])}
        </button>
      ))}
    </div>
  );
}
