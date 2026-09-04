"use client";

import { useState, type ReactNode } from "react";

export default function Tabs({ tabs, defaultActiveId }: { tabs: { id: string; label: string; content: ReactNode }[]; defaultActiveId?: string }) {
  const [active, setActive] = useState(defaultActiveId && tabs.some((t) => t.id === defaultActiveId) ? defaultActiveId : tabs[0]?.id);

  return (
    <div>
      <div className="flex gap-1 border-b border-border mb-6 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              active === t.id
                ? "border-brand text-brand"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} className={active === t.id ? "block" : "hidden"}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
