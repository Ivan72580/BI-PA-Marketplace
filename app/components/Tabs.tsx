"use client";

import { useState, useId, type ReactNode } from "react";
import { motion } from "framer-motion";

// Pestañas como control segmentado (estilo iOS): píldora gris con la activa en blanco y sombra suave.
// El contenido va debajo sin caja propia — las tarjetas de adentro ya llevan su borde.
export default function Tabs({ tabs, defaultActiveId }: { tabs: { id: string; label: string; content: ReactNode }[]; defaultActiveId?: string }) {
  const [active, setActive] = useState(defaultActiveId && tabs.some((t) => t.id === defaultActiveId) ? defaultActiveId : tabs[0]?.id);
  const groupId = useId();

  return (
    <div>
      <div role="tablist" className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-surface-panel p-1">
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.id)}
              className={`relative px-4 py-1.5 text-sm whitespace-nowrap transition-colors rounded-full ${
                isActive ? "text-ink font-semibold" : "text-ink-muted font-medium hover:text-ink"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId={`${groupId}-tab-bg`}
                  className="absolute inset-0 rounded-full bg-surface shadow-sm"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                />
              )}
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-5">
        {tabs.map((t) => (
          <div key={t.id} className={active === t.id ? "block" : "hidden"}>
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
