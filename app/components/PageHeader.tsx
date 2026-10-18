import type { ReactNode } from "react";

// Encabezado único de cada página: alcance actual (solo el nivel elegido), título, subtítulo y, a la
// derecha, el filtro colapsable y/o acciones.
//
// `scope` es SOLO el selector actual — el nombre de la región, del market o de la facility que se esté
// viendo, nunca la cadena completa (región › market › facility). Con toda la red seleccionada no se pasa
// nada y no se dibuja nada. Para cambiar de alcance se usa el filtro; subir de nivel es elegir "Todos"
// ahí. Los nombres los resuelve cada página con sus propias consultas (ver names.* en cada page.tsx).
export default function PageHeader({
  scope,
  title,
  subtitle,
  filter,
  actions,
}: {
  scope?: string | null;
  title: ReactNode;
  subtitle?: ReactNode;
  filter?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4 print:mb-3">
      <div className="min-w-0">
        {scope && <div className="text-xs font-medium text-brand mb-1 truncate">{scope}</div>}
        <h1 className="font-display text-3xl font-bold text-ink leading-tight">{title}</h1>
        {subtitle && <div className="text-sm text-ink-faint mt-1 max-w-2xl">{subtitle}</div>}
      </div>
      {(filter || actions) && (
        <div className="flex items-center gap-2 shrink-0 print:hidden">
          {actions}
          {filter}
        </div>
      )}
    </header>
  );
}
