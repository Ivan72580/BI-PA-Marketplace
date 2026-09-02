export default function GroupSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface-panel/60 border border-border p-4">
      <div className="text-xs font-medium text-ink-muted mb-3 px-1">{title}</div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}
