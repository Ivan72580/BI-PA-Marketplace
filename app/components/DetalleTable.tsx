"use client";

import { useMemo, useState } from "react";

type GameListItem = {
  id: number;
  date: string;
  dayOfWeek: string;
  time: string;
  facilityName: string;
  status: "CONFIRMED" | "CANCELLED";
  finalPlayers: number;
  maxPlayers: number;
  cancellationReason: string | null;
};

type SortKey = "date" | "dayOfWeek" | "time" | "status" | "finalPlayers" | "cancellationReason";

const DAY_LABEL: Record<string, string> = {
  Monday: "Lunes", Tuesday: "Martes", Wednesday: "Miércoles", Thursday: "Jueves", Friday: "Viernes", Saturday: "Sábado", Sunday: "Domingo",
};

// Declarado afuera de DetalleTable a propósito: un componente definido
// dentro del render se recrea en cada re-render, lo cual React (y el lint
// de Next.js) marca como error real, no solo advertencia.
function SortableTh({
  sortableKey,
  label,
  activeSortKey,
  sortDir,
  onSort,
}: {
  sortableKey: SortKey;
  label: string;
  activeSortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  return (
    <th className="py-1.5 px-2 font-normal cursor-pointer select-none hover:text-ink" onClick={() => onSort(sortableKey)}>
      {label} {activeSortKey === sortableKey ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );
}

export default function DetalleTable({ items, total }: { items: GameListItem[]; total: number }) {
  const [dayFilter, setDayFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [reasonFilter, setReasonFilter] = useState("Todos");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const days = useMemo(() => Array.from(new Set(items.map((i) => i.dayOfWeek))), [items]);
  const reasons = useMemo(() => Array.from(new Set(items.map((i) => i.cancellationReason).filter((r): r is string => !!r))), [items]);

  const filtered = useMemo(() => {
    let rows = items;
    if (dayFilter !== "Todos") rows = rows.filter((r) => r.dayOfWeek === dayFilter);
    if (statusFilter !== "Todos") rows = rows.filter((r) => r.status === statusFilter);
    if (reasonFilter !== "Todos") rows = rows.filter((r) => r.cancellationReason === reasonFilter);

    return [...rows].sort((a, b) => {
      let cmp: number;
      if (sortKey === "finalPlayers") {
        cmp = a.finalPlayers - b.finalPlayers;
      } else {
        const av = sortKey === "date" ? a.date : sortKey === "dayOfWeek" ? a.dayOfWeek : sortKey === "time" ? a.time : sortKey === "status" ? a.status : a.cancellationReason;
        const bv = sortKey === "date" ? b.date : sortKey === "dayOfWeek" ? b.dayOfWeek : sortKey === "time" ? b.time : sortKey === "status" ? b.status : b.cancellationReason;
        cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [items, dayFilter, statusFilter, reasonFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const selectClass = "rounded-lg border border-border-strong bg-surface px-2 py-1 text-xs text-ink";

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <select className={selectClass} value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
          <option value="Todos">Todos los días</option>
          {days.map((d) => <option key={d} value={d}>{DAY_LABEL[d] ?? d}</option>)}
        </select>
        <select className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="Todos">Todos los estados</option>
          <option value="CONFIRMED">Confirmado</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
        {reasons.length > 0 && (
          <select className={selectClass} value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}>
            <option value="Todos">Todos los motivos</option>
            {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <SortableTh sortableKey="date" label="Fecha" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh sortableKey="dayOfWeek" label="Día" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh sortableKey="time" label="Hora" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="py-1.5 px-2 font-normal">Facility</th>
              <SortableTh sortableKey="status" label="Estado" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh sortableKey="finalPlayers" label="Jugadores" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh sortableKey="cancellationReason" label="Motivo cancelación" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.id} className="border-b border-surface-sunken">
                <td className="py-1.5 px-2 text-ink">{g.date}</td>
                <td className="py-1.5 px-2 text-ink">{DAY_LABEL[g.dayOfWeek] ?? g.dayOfWeek}</td>
                <td className="py-1.5 px-2 text-ink">{g.time}</td>
                <td className="py-1.5 px-2 text-ink">{g.facilityName}</td>
                <td className="py-1.5 px-2">
                  <span className={g.status === "CONFIRMED" ? "text-brand" : "text-danger"}>{g.status === "CONFIRMED" ? "Confirmado" : "Cancelado"}</span>
                </td>
                <td className="py-1.5 px-2 text-ink">{g.finalPlayers}/{g.maxPlayers}</td>
                <td className="py-1.5 px-2 text-ink-muted">{g.cancellationReason ?? "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="py-4 text-center text-ink-faint">Sin partidos que coincidan con el filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-ink-faint mt-2">
        {filtered.length} de {items.length} mostrados{total > items.length ? ` (${total} en total, capado a los ${items.length} más recientes)` : ""}
      </div>
    </div>
  );
}
