export default function GroupSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface-panel/60 border border-border p-4">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="w-1 h-4 rounded-full bg-accent shrink-0" aria-hidden="true" />
        <div className="font-display text-sm font-semibold text-ink">{title}</div>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}
