"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "../lib/actions/locale";
import { locales, type Locale } from "@/i18n/config";

// Pill switch ES|EN, mismo patrón visual que el toggle Confirmados/Cancelados
// de MustScheduleBoard. Vive en UserMenu. router.refresh() es un respaldo
// explícito a la revalidación de la server action: el idioma se lee en el
// layout raíz (fuera del árbol de la página actual), así que conviene forzar
// el refresh en vez de depender solo del comportamiento implícito del router.
export default function LanguageSwitcher({ locale }: { locale: Locale }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSelect(next: Locale) {
    if (next === locale || isPending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div className="inline-flex items-center rounded-full bg-white/10 p-0.5 text-[11px] font-semibold gap-0.5">
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => handleSelect(l)}
          disabled={isPending}
          aria-pressed={locale === l}
          className={`px-2 py-1 rounded-full uppercase transition-colors ${
            locale === l ? "bg-accent text-[#0b3b2e]" : "text-white/70 hover:text-white"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
