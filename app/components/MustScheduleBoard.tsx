"use client";

import { useState, type ReactNode } from "react";
import MustScheduleCalendar, { type MustScheduleCalendarCell } from "./MustScheduleCalendar";
import Tabs from "./Tabs";

// Pestaña Confirmados/Cancelados dentro del mismo recuadro — ambos datasets
// (calendario + insights) ya vienen calculados desde el servidor en un solo
// pase (getMustScheduleSlots), así que el toggle acá es puramente de qué
// props mostrar, sin research ni fetch adicional al cambiar de modo.
export default function MustScheduleBoard({
  days,
  hours,
  confirmedCells,
  cancelledCells,
  confirmedTabs,
  cancelledTabs,
}: {
  days: string[];
  hours: string[];
  confirmedCells: MustScheduleCalendarCell[];
  cancelledCells: MustScheduleCalendarCell[];
  confirmedTabs: { id: string; label: string; content: ReactNode }[];
  cancelledTabs: { id: string; label: string; content: ReactNode }[];
}) {
  const [mode, setMode] = useState<"confirmed" | "cancelled">("confirmed");
  const isCancelled = mode === "cancelled";

  return (
    <div>
      <div className="flex justify-center mb-5">
        <div className="inline-flex items-center rounded-full bg-surface-sunken p-1 text-sm font-medium gap-1">
          <button
            type="button"
            onClick={() => setMode("confirmed")}
            className={`px-4 py-1.5 rounded-full transition-colors ${!isCancelled ? "bg-brand text-white shadow-sm" : "text-ink-muted hover:text-ink"}`}
          >
            Confirmados
          </button>
          <button
            type="button"
            onClick={() => setMode("cancelled")}
            className={`px-4 py-1.5 rounded-full transition-colors ${isCancelled ? "bg-danger text-white shadow-sm" : "text-ink-muted hover:text-ink"}`}
          >
            Cancelados
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
        <div className="flex justify-center w-full">
          <MustScheduleCalendar
            days={days}
            hours={hours}
            cells={isCancelled ? cancelledCells : confirmedCells}
            tone={isCancelled ? "cancel" : "confirm"}
            emptyLabel={
              isCancelled
                ? "Ningún slot supera el 55% de cancelación en los últimos 3 meses con muestra suficiente — buena señal."
                : "Todavía no hay slots que superen el 55% de confirmación en los últimos 3 meses con muestra suficiente."
            }
          />
        </div>
        {/* Mismos ids en ambos juegos de pestañas ("dow"/"top"/"watch") para
            que Tabs conserve cuál está seleccionada al cambiar de modo. */}
        <div className="lg:sticky lg:top-20">
          <Tabs tabs={isCancelled ? cancelledTabs : confirmedTabs} />
        </div>
      </div>
    </div>
  );
}
