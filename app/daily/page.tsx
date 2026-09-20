import Link from "next/link";
import {
  getFilterOptions,
  getDaySnapshot,
  getDayBaseline,
  getDayEvolution,
  getWeekStrip,
  getRecentDailyTrend,
  getMustScheduleSlots,
  getDayOfWeekPattern,
  type DaySummary,
  type DayBaseline,
  type DayEvolutionPoint,
} from "../lib/db/queries";
import { todayISO } from "../lib/period";
import FilterPanel from "../components/FilterPanel";
import DailyBreadcrumb from "../components/DailyBreadcrumb";
import GroupSection from "../components/GroupSection";
import ChangeBadge from "../components/ChangeBadge";
import Glossary from "../components/Glossary";
import DatePicker from "../components/DatePicker";
import Sparkline from "../components/Sparkline";
import EvolutionChart from "../components/charts/EvolutionChart";
import MustScheduleCalendar from "../components/MustScheduleCalendar";

type SP = { regionId?: string; marketId?: string; facilityId?: string; date?: string };

function buildDailyQuery(current: SP, overrides: Partial<SP>): string {
  const merged: SP = { ...current, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/daily?${qs}` : "/daily";
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function formatUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatUSD2(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function isValidDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
      <div className="flex items-center justify-between mb-0.5">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        {action}
      </div>
      {subtitle && <p className="text-xs text-ink-faint mb-4">{subtitle}</p>}
      {!subtitle && action === undefined && <div className="mb-2" />}
      {children}
    </div>
  );
}

const MIN_SAMPLE_FOR_RATE_BAR = 3;

// Mismo criterio visual que RateBarList en Trends (barra confirmación/cancelación
// apilada) — copiado localmente en vez de importado porque allá es privado del
// módulo y esta página ya tiene su propia convención de tipos por sección.
function RateBarList({ rows }: { rows: { key: string; label: string; confirmationRate: number; cancellationRate: number; totalGames: number }[] }) {
  if (rows.length === 0) return <div className="text-sm text-ink-faint">Sin datos suficientes.</div>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex justify-between text-xs mb-1 gap-2">
            <span className="text-ink truncate">{r.label}</span>
            <span className="text-ink-faint shrink-0">
              {formatPct(r.confirmationRate)} <span className="text-ink-faint/70">· {r.totalGames.toLocaleString("en-US")}</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden flex bg-surface-sunken">
            <div className="h-1.5 bg-brand" style={{ width: `${r.confirmationRate * 100}%` }} />
            <div className="h-1.5 bg-danger" style={{ width: `${r.cancellationRate * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, sublabel, delta, deltaInvert }: { label: string; value: string; sublabel?: string; delta?: number | null; deltaInvert?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-5">
      <div className="text-xs text-ink-faint mb-1">{label}</div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="font-display text-xl font-semibold text-ink">{value}</div>
        {delta !== undefined && <ChangeBadge value={delta} invert={deltaInvert} />}
      </div>
      {sublabel && <div className="text-xs text-ink-faint mt-0.5">{sublabel}</div>}
    </div>
  );
}

// Insights de "variación diaria" + "recomendaciones" — determinísticos,
// calculados sobre datos ya obtenidos (mismo criterio que buildQuarterInsights
// en Trends), no una consulta nueva.
function buildDayInsights(summary: DaySummary, baseline: DayBaseline, evolution: DayEvolutionPoint[]): string[] {
  const lines: string[] = [];

  if (summary.totalGames === 0) {
    lines.push(`Sin partidos registrados este ${summary.dayLabel.toLowerCase()} en esta facility.`);
    return lines;
  }

  if (baseline.occurrences >= 3) {
    const deltaConfirm = summary.confirmationRate - baseline.avgConfirmationRate;
    const deltaPts = Math.abs(deltaConfirm * 100).toFixed(1);
    if (Math.abs(deltaConfirm) < 0.03) {
      lines.push(`La confirmación de hoy (${formatPct(summary.confirmationRate)}) está en línea con el promedio de los últimos ${baseline.occurrences} ${summary.dayLabel.toLowerCase()}s (${formatPct(baseline.avgConfirmationRate)}).`);
    } else if (deltaConfirm > 0) {
      lines.push(`La confirmación de hoy (${formatPct(summary.confirmationRate)}) está ${deltaPts} pts por encima del promedio de los últimos ${baseline.occurrences} ${summary.dayLabel.toLowerCase()}s (${formatPct(baseline.avgConfirmationRate)}) — buena señal.`);
    } else {
      lines.push(`La confirmación de hoy (${formatPct(summary.confirmationRate)}) está ${deltaPts} pts por debajo del promedio de los últimos ${baseline.occurrences} ${summary.dayLabel.toLowerCase()}s (${formatPct(baseline.avgConfirmationRate)}) — vale la pena revisar qué cambió.`);
    }

    const deltaGames = summary.totalGames - baseline.avgGamesPerOccurrence;
    if (Math.abs(deltaGames) >= 1) {
      const dir = deltaGames > 0 ? "más" : "menos";
      lines.push(`Hubo ${Math.abs(Math.round(deltaGames))} partido(s) ${dir} que el promedio habitual para este día (${baseline.avgGamesPerOccurrence.toFixed(1)} partidos).`);
    }
  } else {
    lines.push(`Todavía no hay suficiente historial de ${summary.dayLabel.toLowerCase()}s previos en esta facility como para comparar con una línea base confiable.`);
  }

  const topCancel = summary.cancellationBreakdown[0];
  if (topCancel && topCancel.count >= 2) {
    lines.push(`El motivo de cancelación más frecuente hoy fue "${topCancel.label}" (${topCancel.count} de ${summary.cancelledGames} cancelados).`);
  }

  const dayWord = summary.dayLabel.toLowerCase();
  const withData = evolution.filter((p) => p.totalGames > 0);

  // Punto 1: análisis resumido de las últimas semanas (mínimo 6, hasta las
  // 12 que trae `evolution`) — tendencia general, no solo el día de hoy.
  if (withData.length >= 6) {
    const first = withData[0];
    const lastPoint = withData[withData.length - 1];
    const rates = withData.map((p) => p.confirmationRate);
    const maxRate = Math.max(...rates);
    const minRate = Math.min(...rates);
    const diff = lastPoint.confirmationRate - first.confirmationRate;
    const trendWord = diff >= 0.08 ? "una tendencia creciente" : diff <= -0.08 ? "una tendencia decreciente" : "una tendencia relativamente estable";
    lines.push(
      `En las últimas ${withData.length} semanas, la confirmación de los ${dayWord}s muestra ${trendWord}: pasó de ${formatPct(first.confirmationRate)} a ${formatPct(lastPoint.confirmationRate)} (mínimo ${formatPct(minRate)}, máximo ${formatPct(maxRate)}).`
    );
  } else {
    lines.push(`Todavía no hay 6 ${dayWord}s de historial como para analizar la tendencia de varias semanas.`);
  }

  // Punto 2: comportamiento de HOY respecto a esa tendencia reciente (no el
  // promedio plano de la línea base — acá importa si hoy siguió, aceleró o
  // rompió la dirección en la que venían las últimas ocurrencias).
  if (withData.length >= 4) {
    const today = withData[withData.length - 1];
    const recentWindow = withData.slice(0, -1).slice(-3);
    if (recentWindow.length >= 2) {
      const recentAvg = recentWindow.reduce((s, p) => s + p.confirmationRate, 0) / recentWindow.length;
      const diffFromTrend = today.confirmationRate - recentAvg;
      const diffPts = Math.abs(diffFromTrend * 100).toFixed(1);
      if (Math.abs(diffFromTrend) < 0.05) {
        lines.push(`El comportamiento de hoy está en línea con la tendencia reciente de los últimos ${recentWindow.length} ${dayWord}s (~${formatPct(recentAvg)}).`);
      } else if (diffFromTrend > 0) {
        lines.push(`Hoy estuvo ${diffPts} pts por encima de la tendencia reciente (~${formatPct(recentAvg)} en los últimos ${recentWindow.length} ${dayWord}s) — podría ser una mejora puntual o el comienzo de un cambio de tendencia, vale la pena confirmarlo la semana próxima.`);
      } else {
        lines.push(`Hoy estuvo ${diffPts} pts por debajo de la tendencia reciente (~${formatPct(recentAvg)} en los últimos ${recentWindow.length} ${dayWord}s) — vale la pena revisar si es un evento puntual o el inicio de una baja sostenida.`);
      }
    }
  }

  return lines;
}

export default async function DailyPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filterOptions = await getFilterOptions();

  // ---------- Selección obligatoria: región, market Y facility ----------
  // A diferencia de Trends/Market (que admiten un panorama agregado), esta
  // página reporta el detalle operativo de UNA facility en UN día puntual —
  // sin facility no hay "todo lo que pasó" que mostrar.
  if (!sp.regionId || !sp.marketId || !sp.facilityId) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold text-ink mb-1">Seguimiento diario</h1>
        <div className="text-sm text-ink-faint mb-4 max-w-2xl">
          Detalle operativo día por día de una facility puntual: qué pasó, cómo se compara con días anteriores similares, y qué horarios conviene tener agendados sí o sí.
        </div>

        <div className="rounded-2xl bg-brand-soft/50 border border-brand/25 px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">Elegí región, market y facility para ver el detalle diario</div>
            <div className="text-xs text-ink-muted">Esta vista es por facility puntual — no tiene un panorama de red o de market agregado.</div>
          </div>
          <FilterPanel regions={filterOptions.regions} markets={filterOptions.markets} facilities={filterOptions.facilities} showTimeControls={false} bare />
        </div>
      </div>
    );
  }

  const dateISO = isValidDate(sp.date) ? sp.date : todayISO();

  const [summary, baseline, evolution, weekStrip, recentTrend, mustSchedule, dayOfWeekPattern] = await Promise.all([
    getDaySnapshot(sp.facilityId, dateISO),
    getDayBaseline(sp.facilityId, dateISO),
    getDayEvolution(sp.facilityId, dateISO),
    getWeekStrip(sp.facilityId, dateISO),
    getRecentDailyTrend(sp.facilityId, dateISO),
    getMustScheduleSlots(sp.facilityId, dateISO),
    getDayOfWeekPattern({ facilityId: sp.facilityId }),
  ]);

  const sparklinePoints = recentTrend.map((p) => Math.round(p.confirmationRate * 1000) / 10);

  // Todo el historial disponible de esta facility, sin filtrar por el día
  // elegido arriba — responde "¿qué día de la semana funciona mejor acá en
  // general?", no "¿qué tan bien le fue a este día puntual?".
  const dayOfWeekRows = dayOfWeekPattern.filter((r) => r.totalGames >= MIN_SAMPLE_FOR_RATE_BAR);

  const insights = buildDayInsights(summary, baseline, evolution);

  const evolutionChartData = {
    labels: evolution.map((p) => p.label),
    datasets: [
      {
        label: "Confirmación",
        data: evolution.map((p) => Math.round(p.confirmationRate * 1000) / 10),
        borderColor: "#16755c",
      },
    ],
  };

  return (
    <div className="space-y-5">
      <div>
        <DailyBreadcrumb regions={filterOptions.regions} markets={filterOptions.markets} facilities={filterOptions.facilities} sp={sp} />
        <h1 className="font-display text-3xl font-bold text-ink mb-1">Seguimiento diario</h1>
        <div className="text-sm text-ink-faint">{summary.dayLabel} {dateISO} — {summary.facilityName}</div>
      </div>

      <div className="rounded-2xl bg-surface shadow-sm p-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-ink-faint shrink-0">Día:</span>
        <DatePicker value={dateISO} paramName="date" />
        <div className="flex items-center gap-1 flex-wrap">
          {weekStrip.map((d) => (
            <Link
              key={d.dateISO}
              href={buildDailyQuery(sp, { date: d.dateISO })}
              className={`flex flex-col items-center rounded-lg px-2.5 py-1.5 min-w-[52px] text-center transition-colors ${
                d.dateISO === dateISO ? "bg-brand text-white" : d.hasData ? "bg-surface-sunken hover:bg-brand-soft text-ink" : "bg-surface-sunken/50 text-ink-faint"
              }`}
            >
              <span className="text-[10px] font-medium">{d.dayLabel}</span>
              <span className="text-[10px]">{d.hasData ? formatPct(d.confirmationRate) : "—"}</span>
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-ink-faint leading-none mb-1">Últimos 15 días</span>
            <Sparkline points={sparklinePoints} />
          </div>
          <Link href={buildDailyQuery(sp, { date: undefined })} className="text-ink-faint hover:text-brand text-xs shrink-0">hoy</Link>
        </div>
      </div>

      {summary.totalGames === 0 ? (
        <div className="rounded-2xl bg-surface shadow-sm p-6 text-sm text-ink-faint">
          Sin partidos registrados este día en {summary.facilityName}. Elegí otro día en la franja de arriba.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Stat label="Partidos" value={String(summary.totalGames)} sublabel={`${summary.confirmedGames} confirmados · ${summary.cancelledGames} cancelados`} />
            <Stat label="Confirmación" value={formatPct(summary.confirmationRate)} delta={baseline.occurrences >= 3 ? summary.confirmationRate - baseline.avgConfirmationRate : undefined} />
            <Stat label="Ocupación" value={formatPct(summary.occupancyRate)} delta={baseline.occurrences >= 3 ? summary.occupancyRate - baseline.avgOccupancyRate : undefined} />
            <Stat label="Revenue del día" value={formatUSD(summary.totalRevenue)} sublabel={summary.avgRating != null ? `Rating promedio: ${summary.avgRating.toFixed(1)}` : undefined} />
            <Stat
              label="Precio x jugador"
              value={summary.avgRevenuePerPlayer != null ? formatUSD2(summary.avgRevenuePerPlayer) : "—"}
              sublabel={summary.avgGamePrice != null ? `Ticket promedio: ${formatUSD2(summary.avgGamePrice)}` : undefined}
            />
          </div>

          <GroupSection title="Variación e insights del día">
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5">
              <SectionCard title={`Evolución de la confirmación — últimos ${evolution.length} ${summary.dayLabel.toLowerCase()}s`} subtitle="Misma facility, mismo día de semana">
                {evolution.length > 1 ? (
                  <EvolutionChart data={evolutionChartData} />
                ) : (
                  <div className="text-sm text-ink-faint">No hay suficiente historial de {summary.dayLabel.toLowerCase()}s todavía para graficar una evolución.</div>
                )}
              </SectionCard>
              <SectionCard title="Qué muestra hoy" subtitle="Variación vs. línea base + recomendación">
                <ul className="space-y-2 text-sm text-ink">
                  {insights.map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-brand shrink-0">·</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            </div>
          </GroupSection>

          <GroupSection title="Detalle de los partidos del día">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.games.map((g) => (
                <div key={g.id} className={`rounded-xl border p-3 ${g.status === "CONFIRMED" ? "border-brand/25 bg-brand-soft/30" : "border-danger/25 bg-danger-soft/30"}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-ink">{g.time}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${g.status === "CONFIRMED" ? "bg-brand text-white" : "bg-danger text-white"}`}>
                      {g.status === "CONFIRMED" ? "Confirmado" : "Cancelado"}
                    </span>
                  </div>
                  <div className="text-xs text-ink-muted mb-1.5">{g.formatLabel} · {g.organizer}</div>
                  <div className="text-xs text-ink-faint space-y-0.5">
                    <div>{g.finalPlayers}/{g.maxPlayers} jugadores (mín. {g.minPlayers}){g.waitlistPlayers > 0 ? ` · ${g.waitlistPlayers} en espera` : ""}{g.droppedPlayers > 0 ? ` · ${g.droppedPlayers} abandonaron` : ""}</div>
                    {g.status === "CANCELLED" && g.playersMissing != null && g.playersMissing > 0 && (
                      <div>Faltaron {g.playersMissing} jugador(es) para el mínimo</div>
                    )}
                    {g.cancellationReason && <div>Motivo: {g.cancellationReason}</div>}
                    {g.confirmationLeadTime != null && <div>Lead time: {g.confirmationLeadTime.toFixed(1)}h</div>}
                    {g.gamePrice != null && (
                      <div>Precio: {formatUSD2(g.gamePrice)}{g.revenuePerPlayer != null ? ` · ${formatUSD2(g.revenuePerPlayer)}/jugador` : ""}</div>
                    )}
                    {g.eventRevenue != null && <div>Revenue: {formatUSD(g.eventRevenue)}</div>}
                    {g.averageRating != null && (
                      <div>Rating: {g.averageRating.toFixed(1)}{g.ratingCount != null && g.ratingCount > 0 ? ` (${g.ratingCount})` : ""}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </GroupSection>
        </>
      )}

      <GroupSection title="Slots que sí o sí conviene tener agendados">
        <p className="text-xs text-ink-faint -mt-1">
          Ventana móvil de los últimos 3 meses (a partir del día elegido arriba) · más de 55% de confirmación · se excluyen por completo las cancelaciones por cancha no disponible.
          Metodología propia de esta página — distinta de la consistencia histórica que usa Trends.
        </p>
        <MustScheduleCalendar days={mustSchedule.days} hours={mustSchedule.hours} cells={mustSchedule.cells} />
        <Glossary items={[{ term: "Tasa de confirmación", def: "confirmados / (confirmados + cancelados), excluyendo del cálculo las cancelaciones por cancha no disponible." }]} />

        {/* Lecturas adicionales sobre la misma ventana de 3 meses — plegadas por
            default (<details> nativo, sin JS de cliente) para no extender la
            página; mismo patrón ya usado en GameList/NetworkOverview. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <details className="rounded-2xl bg-surface shadow-sm p-5">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              Performance por día de la semana
            </summary>
            <p className="text-xs text-ink-faint mt-1 mb-3">Todo el historial de esta facility, todos los horarios.</p>
            <RateBarList rows={dayOfWeekRows} />
          </details>

          <details className="rounded-2xl bg-surface shadow-sm p-5">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              Slots con confirmación altísima ({mustSchedule.topSlots.length})
            </summary>
            <p className="text-xs text-ink-faint mt-1 mb-3">≥90% en los últimos 3 meses · promedio de sus partidos confirmados.</p>
            {mustSchedule.topSlots.length > 0 ? (
              <ul className="space-y-3 text-sm">
                {mustSchedule.topSlots.map((s, i) => (
                  <li key={i} className="border-b border-surface-sunken last:border-0 pb-2.5 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink font-medium">{s.dayLabel} {s.hour} · {s.formatLabel}</span>
                      <span className="text-brand font-semibold shrink-0">{formatPct(s.confirmationRate)}</span>
                    </div>
                    <div className="text-xs text-ink-faint mt-0.5">
                      {s.avgOccupancyRate != null ? `${formatPct(s.avgOccupancyRate)} ocupación` : "ocupación —"}
                      {s.avgGamePrice != null && ` · ${formatUSD2(s.avgGamePrice)}${s.avgRevenuePerPlayer != null ? ` (${formatUSD2(s.avgRevenuePerPlayer)}/jugador)` : ""}`}
                      {s.avgRating != null && ` · rating ${s.avgRating.toFixed(1)}`}
                      {s.avgLeadTime != null && ` · lead time ${s.avgLeadTime.toFixed(1)}h`}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-ink-faint">Todavía no hay slots con 90%+ de confirmación en esta facility.</div>
            )}
          </details>

          <details className="rounded-2xl bg-surface shadow-sm p-5">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              Slots a vigilar ({mustSchedule.strugglingSlots.length})
            </summary>
            <p className="text-xs text-ink-faint mt-1 mb-3">Bajando o estancados por debajo del umbral.</p>
            {mustSchedule.strugglingSlots.length > 0 ? (
              <ul className="space-y-3 text-sm">
                {mustSchedule.strugglingSlots.map((s, i) => (
                  <li key={i} className="border-b border-surface-sunken last:border-0 pb-2.5 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink font-medium">{s.dayLabel} {s.hour} · {s.formatLabel}</span>
                      <span className={`shrink-0 font-semibold ${s.reason === "declining" ? "text-warning" : "text-ink-faint"}`}>{formatPct(s.confirmationRate)}</span>
                    </div>
                    <div className="text-xs text-ink-faint mt-0.5">{s.insight}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-ink-faint">No hay slots bajando o estancados para reportar.</div>
            )}
          </details>
        </div>
      </GroupSection>
    </div>
  );
}
