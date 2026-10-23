import { useTranslations } from "next-intl";

// Glosario de cada sección: un botón chico, alineado a la derecha del pie de la sección, que despliega las
// definiciones. Así la lectura normal queda libre de texto de apoyo y la explicación está a un clic.
export default function Glossary({ items }: { items: { term: string; def: string }[] }) {
  const t = useTranslations("Glossary");
  return (
    <details className="group mt-4 flex flex-col items-end">
      <summary className="list-none cursor-pointer select-none inline-flex items-center gap-1.5 rounded-full bg-brand-soft/70 text-brand ring-1 ring-brand/20 px-3 py-1 text-xs font-medium hover:bg-brand-soft transition-colors [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-fill text-white text-[10px] font-bold leading-none">i</span>
        {t("label")}
        <span aria-hidden="true" className="text-[10px] transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-2 w-full rounded-xl bg-surface-sunken p-3 grid gap-1.5 text-left">
        {items.map((it) => (
          <p key={it.term} className="text-[11px] leading-snug text-ink-muted">
            <span className="font-semibold text-ink">{it.term}:</span> {it.def}
          </p>
        ))}
      </div>
    </details>
  );
}
