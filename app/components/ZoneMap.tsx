"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import type { MapZone } from "../lib/mapZones";

type Metric = "games" | "perField";

// Mapa base. Por defecto, el servidor estándar de OpenStreetMap (sin API key; su política de uso
// pide tráfico moderado y atribución, suficiente para una herramienta interna). Si más adelante
// hace falta otro estilo o más volumen (MapTiler, Stadia, Mapbox...), se cambia con estas variables
// de entorno sin tocar código. Ojo: son NEXT_PUBLIC_*, se leen al compilar.
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type ZoneMapLabels = {
  metricGames: string;
  metricPerField: string;
  metricHint: string;
  zonesTitle: string;
  confirmed: string; // "Confirmados"
  confirmationRate: string;
  revenue: string;
  gamesPerField: string;
  noFields: string;
  approximate: string;
  facilitiesIn: string; // "Facilities en {zone}"
  seeDetail: string;
  clickHint: string;
  scheduled: string;
};

const fmt = (n: number) => n.toLocaleString("en-US");
const fmt1 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(0)}%`);

function valueOf(z: MapZone, metric: Metric): number {
  return metric === "games" ? z.confirmedGames : (z.gamesPerField ?? 0);
}

export default function ZoneMap({ zones, labels, detailQuery }: { zones: MapZone[]; labels: ZoneMapLabels; detailQuery: string }) {
  const [metric, setMetric] = useState<Metric>("games");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  const fittedRef = useRef(false);

  const sorted = useMemo(() => [...zones].sort((a, b) => valueOf(b, metric) - valueOf(a, metric)), [zones, metric]);
  const selected = zones.find((z) => z.key === selectedKey) ?? null;

  // Crea el mapa una sola vez (Leaflet toca el DOM: solo en el cliente, import dinámico).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([37.5, -96], 4);
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true); // dispara el primer dibujo de burbujas
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      fittedRef.current = false;
      setMapReady(false);
    };
  }, []);

  // Dibuja / redibuja las burbujas cuando cambian zonas, métrica o selección.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    const max = Math.max(1, ...zones.map((z) => valueOf(z, metric)));
    for (const z of zones) {
      const v = valueOf(z, metric);
      const radius = 7 + Math.sqrt(v / max) * 30;
      const isSel = z.key === selectedKey;
      const marker = L.circleMarker([z.latitude, z.longitude], {
        radius,
        color: isSel ? "#0b3b2e" : "#16755c",
        weight: isSel ? 3 : 1.5,
        // Zona con puntos aproximados (centro de ZIP/ciudad): borde punteado.
        dashArray: z.approximateShare > 0.5 ? "4 4" : undefined,
        fillColor: "#16755c",
        fillOpacity: isSel ? 0.7 : 0.45,
      });
      const tip =
        `<strong>${z.label}</strong><br/>${labels.confirmed}: ${fmt(z.confirmedGames)}` +
        `<br/>${labels.gamesPerField}: ${z.gamesPerField === null ? labels.noFields : fmt1(z.gamesPerField)}`;
      marker.bindTooltip(tip, { direction: "top" });
      marker.on("click", () => setSelectedKey(z.key));
      marker.addTo(layer);
    }
    if (!fittedRef.current && zones.length > 0) {
      const bounds = L.latLngBounds(zones.map((z) => [z.latitude, z.longitude]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
      fittedRef.current = true;
    }
  }, [zones, metric, selectedKey, labels, mapReady]);

  function select(z: MapZone) {
    setSelectedKey(z.key);
    mapRef.current?.flyTo([z.latitude, z.longitude], Math.max(mapRef.current.getZoom(), 10), { duration: 0.6 });
  }

  const btn = (m: Metric, text: string) => (
    <button
      type="button"
      onClick={() => setMetric(m)}
      className={`px-3 py-1 text-xs rounded-md border transition-colors ${metric === m ? "bg-brand text-white border-brand" : "bg-surface text-ink-muted border-border hover:border-border-strong"}`}
    >
      {text}
    </button>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 rounded-2xl bg-surface shadow-sm p-3">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {btn("games", labels.metricGames)}
          {btn("perField", labels.metricPerField)}
          <span className="text-[11px] text-ink-faint">{labels.metricHint}</span>
        </div>
        <div ref={containerRef} className="h-[520px] w-full rounded-xl overflow-hidden z-0" />
        <p className="text-[11px] text-ink-faint mt-2">{labels.approximate}</p>
      </div>

      <div className="rounded-2xl bg-surface shadow-sm p-4 max-h-[600px] overflow-y-auto">
        {selected ? (
          <div>
            <button type="button" onClick={() => setSelectedKey(null)} className="text-xs text-brand mb-2">
              ← {labels.zonesTitle}
            </button>
            <h3 className="font-display text-lg font-semibold text-ink">{selected.label}</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-muted my-3">
              <div>{labels.confirmed}: <span className="text-ink font-medium">{fmt(selected.confirmedGames)}</span></div>
              <div>{labels.scheduled}: <span className="text-ink font-medium">{fmt(selected.scheduledGames)}</span></div>
              <div>{labels.confirmationRate}: <span className="text-ink font-medium">{pct(selected.confirmationRate)}</span></div>
              <div>{labels.revenue}: <span className="text-ink font-medium">{usd(selected.revenue)}</span></div>
              <div className="col-span-2">{labels.gamesPerField}: <span className="text-ink font-medium">{selected.gamesPerField === null ? labels.noFields : fmt1(selected.gamesPerField)}</span></div>
            </div>
            <div className="text-xs font-medium text-ink mb-1">{labels.facilitiesIn.replace("{zone}", selected.label)}</div>
            <ul className="divide-y divide-border">
              {selected.facilities.map((f) => (
                <li key={f.id}>
                  <Link href={`/map/${f.id}${detailQuery}`} className="flex items-center justify-between gap-2 py-2 hover:bg-brand-soft rounded px-1 -mx-1">
                    <span className="text-sm text-ink truncate">{f.name}{f.approximate ? " ~" : ""}</span>
                    <span className="text-xs text-ink-muted shrink-0">
                      {fmt(f.confirmedGames)} · {pct(f.confirmationRate)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="text-[11px] text-ink-faint mt-2">{labels.seeDetail}</div>
          </div>
        ) : (
          <div>
            <h3 className="font-display text-base font-semibold text-ink mb-1">{labels.zonesTitle}</h3>
            <p className="text-[11px] text-ink-faint mb-3">{labels.clickHint}</p>
            <ol className="space-y-1">
              {sorted.map((z, i) => {
                const v = valueOf(z, metric);
                const top = Math.max(1, ...zones.map((q) => valueOf(q, metric)));
                return (
                  <li key={z.key}>
                    <button type="button" onClick={() => select(z)} className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-brand-soft">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm text-ink truncate"><span className="text-ink-faint mr-1.5">{i + 1}</span>{z.label}</span>
                        <span className="text-sm font-medium text-ink shrink-0">{metric === "games" ? fmt(v) : z.gamesPerField === null ? "—" : fmt1(v)}</span>
                      </div>
                      <div className="h-1 rounded bg-surface-sunken mt-1">
                        <div className="h-1 rounded bg-brand" style={{ width: `${(v / top) * 100}%` }} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
