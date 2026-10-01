// A propósito NO es GroupSection (components/GroupSection.tsx): ese es
// colapsable, y si alguien lo colapsa antes de imprimir, esa sección
// desaparece del PDF (window.print() imprime el DOM tal cual está, no lo
// que "debería" mostrar). Un documento se lee completo, no se navega por
// pestañas — así que acá no hay toggle, todo se renderiza siempre.
export default function ReportSection({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-surface p-4 shadow-sm print:shadow-none print:rounded-none print:p-0 print:bg-transparent print:border-b print:border-border print:pb-3 ${className}`}>
      <div className="flex items-center gap-2 mb-3 print:mb-2">
        <span className="w-1 h-4 rounded-full bg-brand shrink-0 print:hidden" aria-hidden="true" />
        <div className="font-display text-sm font-semibold text-ink print:text-[11pt]">{title}</div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
