"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function LinkSelect({
  paramName,
  value,
  options,
  clear,
}: {
  paramName: string;
  value: string;
  options: { value: string; label: string }[];
  // Params dependientes que se limpian al cambiar este (ej. al cambiar de región se vacían market y facility).
  clear?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      value={value}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value === "") params.delete(paramName);
        else params.set(paramName, e.target.value);
        for (const k of clear ?? []) params.delete(k);
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }}
      className="rounded-lg border border-border-strong bg-surface px-2.5 py-1 text-sm text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
