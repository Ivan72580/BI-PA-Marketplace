"use client";

import { useState } from "react";

export default function GroupSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-3xl bg-surface-panel/60 border border-border p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 mb-3 px-1 group"
      >
        <span className="w-1 h-4 rounded-full bg-accent shrink-0" aria-hidden="true" />
        <div className="font-display text-sm font-semibold text-ink group-hover:text-brand transition-colors">{title}</div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-ink-faint ml-auto shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="space-y-5">{children}</div>}
    </div>
  );
}
