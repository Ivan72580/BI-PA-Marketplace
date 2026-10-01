"use client";

import { useTranslations } from "next-intl";

// Decisión de Ivan (ver AskUserQuestion): sin Chromium server-side por las
// limitaciones de Vercel Hobby — "descargar" el reporte es imprimir la
// página normal del navegador, que ya está maquetada 1:1 para Letter vía
// @media print (ver globals.css). Un clic extra para el usuario (elegir
// "Guardar como PDF" en el diálogo de impresión) a cambio de cero
// infraestructura nueva y un PDF con texto seleccionable, no una imagen.
export default function DownloadPdfButton() {
  const t = useTranslations("Reports");
  return (
    <div className="print:hidden flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => window.print()}
        className="flex items-center gap-2 rounded-full bg-brand text-white text-sm font-medium px-4 py-2 hover:brightness-95 transition-[filter]"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9V2h12v7" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        {t("downloadPdf")}
      </button>
      <span className="text-[11px] text-ink-faint max-w-[220px] text-right">{t("printHint")}</span>
    </div>
  );
}
