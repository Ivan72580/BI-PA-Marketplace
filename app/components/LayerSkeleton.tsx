// Marcador mientras carga una capa (cada capa se calcula por separado y no frena a las anteriores).
export default function LayerSkeleton({ id }: { id: string }) {
  return (
    <div id={id} className="scroll-mt-32 rounded-2xl bg-surface shadow-sm p-5 animate-pulse" aria-busy="true">
      <div className="h-4 w-40 rounded bg-surface-sunken" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-surface-sunken" />)}
      </div>
    </div>
  );
}
