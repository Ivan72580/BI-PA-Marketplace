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

const DAY_LABEL_ES: Record<string, string> = {
  Monday: "Lunes", Tuesday: "Martes", Wednesday: "Miércoles", Thursday: "Jueves",
  Friday: "Viernes", Saturday: "Sábado", Sunday: "Domingo",
};

export default function GameList({ items, total, showFacility }: { items: GameListItem[]; total: number; showFacility: boolean }) {
  return (
    <details className="rounded-2xl bg-surface border border-border p-5">
      <summary className="cursor-pointer text-sm font-medium text-ink">
        Ver partidos individuales ({total.toLocaleString("en-US")})
      </summary>

      <div className="mt-4 overflow-x-auto">
        {items.length === 0 ? (
          <div className="text-sm text-ink-faint">Sin partidos en este filtro.</div>
        ) : (
          <>
            {total > items.length && (
              <div className="text-xs text-ink-faint mb-2.5">
                Mostrando los {items.length} más recientes de {total.toLocaleString("en-US")} — angostá el filtro para ver más detalle.
              </div>
            )}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-ink-muted">
                  <th className="py-1.5 px-2 font-normal">Fecha</th>
                  <th className="py-1.5 px-2 font-normal">Día</th>
                  <th className="py-1.5 px-2 font-normal">Hora</th>
                  {showFacility && <th className="py-1.5 px-2 font-normal">Facility</th>}
                  <th className="py-1.5 px-2 font-normal">Estado</th>
                  <th className="py-1.5 px-2 font-normal">Jugadores</th>
                  <th className="py-1.5 px-2 font-normal">Motivo cancelación</th>
                </tr>
              </thead>
              <tbody>
                {items.map((g) => (
                  <tr key={g.id} className="border-b border-surface-sunken">
                    <td className="py-1.5 px-2 text-ink">{g.date}</td>
                    <td className="py-1.5 px-2 text-ink">{DAY_LABEL_ES[g.dayOfWeek] ?? g.dayOfWeek}</td>
                    <td className="py-1.5 px-2 text-ink">{g.time}</td>
                    {showFacility && <td className="py-1.5 px-2 text-ink">{g.facilityName}</td>}
                    <td className="py-1.5 px-2">
                      <span className={g.status === "CONFIRMED" ? "text-brand font-medium" : "text-danger font-medium"}>
                        {g.status === "CONFIRMED" ? "Confirmado" : "Cancelado"}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-ink">{g.finalPlayers}/{g.maxPlayers}</td>
                    <td className="py-1.5 px-2 text-ink-faint">{g.cancellationReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="mt-4 pt-3 border-t border-surface-sunken text-[11px] text-ink-faint">
          <span className="font-medium text-ink-muted">Jugadores:</span> confirmados / cupo máximo del partido.{" "}
          <span className="font-medium text-ink-muted">Motivo cancelación:</span> categoría normalizada del motivo original registrado en el dataset.
        </div>
      </div>
    </details>
  );
}
