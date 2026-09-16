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
              className={`relative px-5 py-2.5 text-sm whitespace-nowrap transition-colors rounded-t-xl -mb-px ${
                isActive
                  ? "bg-surface text-ink font-bold z-10 shadow-[0_-2px_8px_rgba(11,59,46,0.06)]"
                  : "bg-transparent text-ink-muted font-medium hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="rounded-b-2xl rounded-tr-2xl bg-surface p-4 shadow-md">
        {tabs.map((t) => (
          <div key={t.id} className={active === t.id ? "block" : "hidden"}>
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
