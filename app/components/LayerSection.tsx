// Una capa del análisis de facility (/facility): un encabezado bien marcado que cierra la capa anterior y abre
// la nueva, y el contenido debajo. La capa de Pronóstico (tone="warning") va en ámbar, igual que en el resto de
// la app, porque es una estimación y no un dato. Las anclas respetan el alto del menú y de la barra de capas.

const TONE = {
  brand: { band: "bg-[#07271f] text-white", bar: "bg-accent", sub: "text-white/70", badge: "bg-white/15 text-white" },
  warning: { band: "bg-warning-soft text-ink ring-1 ring-warning-fill/50", bar: "bg-warning-fill", sub: "text-ink-muted", badge: "bg-warning-fill/25 text-warning" },
} as const;

export default function LayerSection({
  id,
  title,
  subtitle,
  badge,
  tone = "brand",
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  tone?: keyof typeof TONE;
  children: React.ReactNode;
}) {
  const c = TONE[tone];
  return (
    <section id={id} className="scroll-mt-[var(--layer-offset,10rem)]">
      <header className={`rounded-2xl px-6 py-5 mb-5 flex items-center gap-4 shadow-sm ${c.band}`}>
        <span className={`self-stretch w-1.5 rounded-full ${c.bar}`} aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold leading-tight">{title}</h2>
          {subtitle && <p className={`text-sm mt-0.5 ${c.sub}`}>{subtitle}</p>}
        </div>
        {badge && <span className={`ml-auto shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${c.badge}`}>{badge}</span>}
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}
