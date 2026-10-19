"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import { TILE_URL, TILE_ATTRIBUTION, heatColor } from "./ZoneMap";

// Mapa de Market share: una burbuja por market (o por facility cuando ya hay un market elegido).
// Cada burbuja muestra lo mismo que las tarjetas de la vista de tarjetas: cifra principal,
// variación contra el mes anterior y detalle. Los textos y el formato ya vienen resueltos desde
// el servidor (mismos helpers que las tarjetas) para que no haya dos lecturas distintas del mismo dato.

export type ShareBubble = {
  key: string;
  label: string;
  latitude: number;
  longitude: number;
  value: number; // define tamaño y color
  headline: string; // cifra principal, ej. "412" o "18.4%"
  headlineCaption: string; // ej. "partidos confirmados"
  change: string | null; // ej. "↑ 12.0% (+43)"; null si no hay mes previo
  changeTone: "up" | "down" | "flat" | null;
  detail: string | null; // ej. "≈ 13/día"
  approximate: boolean;
  href: string;
};

export type ShareMapLabels = {
  listTitle: string;
  clickHint: string;
  seeDetail: string;
  approximate: string;
  noPriorData: string;
  legendLow: string;
  legendHigh: string;
};

const TONE = { up: "text-brand", down: "text-danger", flat: "text-ink-muted" } as const;
const norm = (v: number, max: number) => Math.sqrt(Math.max(0, v) / Math.max(1, max));

export default function ShareMap({ bubbles, labels }: { bubbles: ShareBubble[]; labels: ShareMapLabels }) {
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

  const sorted = useMemo(() => [...bubbles].sort((a, b) => b.value - a.value), [bubbles]);
  const selected = bubbles.find((b) => b.key === selectedKey) ?? null;
  const max = Math.max(1, ...bubbles.map((b) => b.value));

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
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      fittedRef.current = false;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    for (const b of bubbles) {
      const heat = heatColor(norm(b.value, max));
      const isSel = b.key === selectedKey;
      const marker = L.circleMarker([b.latitude, b.longitude], {
        radius: 7 + Math.sqrt(b.value / max) * 30,
        color: isSel ? "#1f2937" : heat,
        weight: isSel ? 3 : 1.5,
        dashArray: b.approximate ? "4 4" : undefined,
        fillColor: heat,
        fillOpacity: isSel ? 0.85 : 0.65,
      });
      // El tooltip se arma con nodos de texto (no innerHTML): los nombres vienen de datos externos.
      const tip = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = b.label;
      tip.appendChild(strong);
      tip.appendChild(document.createElement("br"));
      tip.appendChild(document.createTextNode(`${b.headline} ${b.headlineCaption}`));
      marker.bindTooltip(tip, { direction: "top" });
      marker.on("click", () => setSelectedKey(b.key));
      marker.addTo(layer);
    }
    if (!fittedRef.current && bubbles.length > 0) {
      map.fitBounds(L.latLngBounds(bubbles.map((b) => [b.latitude, b.longitude])), { padding: [40, 40], maxZoom: 11 });
      fittedRef.current = true;
    }
  }, [bubbles, selectedKey, max, mapReady]);

  function select(b: ShareBubble) {
    setSelectedKey(b.key);
    mapRef.current?.flyTo([b.latitude, b.longitude], Math.max(mapRef.current.getZoom(), 9), { duration: 0.6 });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 rounded-2xl bg-surface shadow-sm p-3">
        <div ref={containerRef} className="h-[440px] w-full rounded-xl overflow-hidden z-0" />
        <div className="flex items-center gap-2 mt-2 text-[11px] text-ink-faint">
          <span>{labels.legendLow}</span>
          <span className="h-2 w-40 rounded-full" style={{ background: `linear-gradient(to right, ${[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => heatColor(t)).join(",")})` }} aria-hidden="true" />
          <span>{labels.legendHigh}</span>
        </div>
        <p className="text-[11px] text-ink-faint mt-1">{labels.approximate}</p>
      </div>

      <div className="rounded-2xl bg-surface shadow-sm p-4 max-h-[600px] overflow-y-auto">
        {selected ? (
          <div>
            <button type="button" onClick={() => setSelectedKey(null)} className="text-xs text-brand mb-2">← {labels.listTitle}</button>
            <h3 className="font-display text-lg font-semibold text-ink">{selected.label}</h3>
            <div className="flex items-baseline gap-2 mt-3">
              <div className="font-display text-2xl font-semibold text-ink">{selected.headline}</div>
              {selected.change ? (
                <span className={`text-sm font-semibold ${selected.changeTone ? TONE[selected.changeTone] : "text-ink-muted"}`}>{selected.change}</span>
              ) : (
                <span className="text-xs text-ink-faint">{labels.noPriorData}</span>
              )}
            </div>
            <div className="text-xs text-ink-faint mt-0.5">
              {selected.headlineCaption}
              {selected.detail ? ` · ${selected.detail}` : ""}
            </div>
            <Link href={selected.href} className="inline-block mt-3 text-sm text-brand hover:underline">{labels.seeDetail} →</Link>
          </div>
        ) : (
          <div>
            <h3 className="font-display text-base font-semibold text-ink mb-1">{labels.listTitle}</h3>
            <p className="text-[11px] text-ink-faint mb-3">{labels.clickHint}</p>
            <ol className="space-y-1">
              {sorted.map((b, i) => (
                <li key={b.key}>
                  <button type="button" onClick={() => select(b)} className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-brand-soft">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-ink truncate"><span className="text-ink-faint mr-1.5">{i + 1}</span>{b.label}</span>
                      <span className="text-sm font-medium text-ink shrink-0">{b.headline}</span>
                    </div>
                    <div className="h-1 rounded bg-surface-sunken mt-1">
                      <div className="h-1 rounded" style={{ width: `${(b.value / max) * 100}%`, backgroundColor: heatColor(norm(b.value, max)) }} />
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
