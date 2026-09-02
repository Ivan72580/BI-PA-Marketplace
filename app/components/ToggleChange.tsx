"use client";

import { useState } from "react";
import ChangeBadge from "./ChangeBadge";

export default function ToggleChange({ value, invert }: { value: number | null; invert?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${show ? "bg-brand text-white" : "bg-surface-sunken text-ink-faint hover:text-ink-muted"}`}
      >
        vs. anterior
      </button>
      {show && <ChangeBadge value={value} invert={invert} />}
    </span>
  );
}
