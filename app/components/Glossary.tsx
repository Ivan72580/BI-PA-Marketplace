export default function Glossary({ items }: { items: { term: string; def: string }[] }) {
  return (
    <div className="mt-4 pt-3 border-t border-surface-sunken flex flex-wrap gap-x-5 gap-y-1">
      {items.map((it) => (
        <span key={it.term} className="text-[11px] text-ink-faint">
          <span className="font-medium text-ink-muted">{it.term}:</span> {it.def}
        </span>
      ))}
    </div>
  );
}
