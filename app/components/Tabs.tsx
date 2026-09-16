"use client";

import { useState, type ReactNode } from "react";

export default function Tabs({ tabs, defaultActiveId }: { tabs: { id: string; label: string; content: ReactNode }[]; defaultActiveId?: string }) {
  const [active, setActive] = useState(defaultActiveId && tabs.some((t) => t.id === defaultActiveId) ? defaultActiveId : tabs[0]?.id);

  return (
    <div>
      <div className="flex gap-1 flex-wrap">
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`relative px-5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors rounded-t-xl border -mb-px ${
                isActive
                  ? "bg-surface border-border border-b-surface text-ink z-10"
                  : "bg-transparent border-transparent text-ink-faint hover:text-ink-muted"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="rounded-b-2xl rounded-tr-2xl border border-border bg-surface p-4">
        {tabs.map((t) => (
          <div key={t.id} className={active === t.id ? "block" : "hidden"}>
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
