"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function DatePicker({ value, paramName = "period" }: { value: string; paramName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <input
      type="date"
      value={value}
      onChange={(e) => {
        if (!e.target.value) return;
        const params = new URLSearchParams(searchParams.toString());
        params.set(paramName, e.target.value);
        router.push(`${pathname}?${params.toString()}`);
      }}
      className="rounded-lg border border-border-strong bg-surface px-2.5 py-1 text-sm text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30"
    />
  );
}
