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
  latitude: number | null; // null = sin ubicación: aparece como tarjeta pero no como burbuja
  longitude: number | null;
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

export default function ShareMap({ items, labels }: { items: ShareBubble[]; labels: ShareMapLabels }) {
  // Solo las entradas con ubicación se dibujan; todas se listan como tarjetas.
  const bubbles = useMemo(() => items.filter((b) => b.latitude !== null && b.longitude !== null), [items]);
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

  const sorted = useMemo(() => [...items].sort((a, b) => b.value - a.value), [items]);
  const max = Math.max(1, ...items.map((b) => b.value));
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
      const marker = L.circleMarker([b.latitude as number, b.longitude as number], {
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
      marker.on("click", () => {
        setSelectedKey(b.key);
        cardRefs.current[b.key]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      marker.addTo(layer);
    }
    if (!fittedRef.current && bubbles.length > 0) {
      map.fitBounds(L.latLngBounds(bubbles.map((b) => [b.latitude as number, b.longitude as number])), { padding: [40, 40], maxZoom: 11 });
      fittedRef.current = true;
    }
  }, [bubbles, selectedKey, max, mapReady]);

  function select(b: ShareBubble) {
    setSelectedKey(b.key);
    if (b.latitude !== null && b.longitude !== null) {
      mapRef.current?.flyTo([b.latitude, b.longitude], Math.max(mapRef.current.getZoom(), 9), { duration: 0.6 });
    }
  }

  // Mapa y tarjetas son una sola vista: tocar una burbuja resalta su tarjeta y tocar una tarjeta centra el mapa.
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
      <div className="lg:col-span-3 lg:sticky lg:top-4 rounded-2xl bg-surface shadow-sm p-3">
        <div ref={containerRef} className="h-[420px] lg:h-[560px] w-full rounded-xl overflow-hidden z-0" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-ink-faint">
          <span className="flex items-center gap-2">
            <span>{labels.legendLow}</span>
            <span className="h-2 w-32 rounded-full" style={{ background: `linear-gradient(to right, ${[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => heatColor(t)).join(",")})` }} aria-hidden="true" />
            <span>{labels.legendHigh}</span>
          </span>
          <span>{labels.approximate}</span>
        </div>
      </div>

      <div className="lg:col-span-2 lg:max-h-[620px] lg:overflow-y-auto pr-1">
        <div className="text-[11px] text-ink-faint mb-2">{labels.listTitle} · {labels.clickHint}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
          {sorted.map((b) => (
            <div
              key={b.key}
              ref={(el) => { cardRefs.current[b.key] = el; }}
              onClick={() => select(b)}
              className={`rounded-2xl bg-surface shadow-sm hover:shadow-lg transition-shadow p-4 cursor-pointer ${selectedKey === b.key ? "ring-2 ring-brand" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <Link href={b.href} onClick={(e) => e.stopPropagation()} className="text-sm font-medium text-brand hover:underline" title={labels.seeDetail}>{b.label} →</Link>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <div className="font-display text-xl font-semibold text-ink">{b.headline}</div>
                {b.change ? (
                  <span className={`text-xs font-semibold ${b.changeTone ? TONE[b.changeTone] : "text-ink-muted"}`}>{b.change}</span>
                ) : (
                  <span className="text-xs text-ink-faint">{labels.noPriorData}</span>
                )}
              </div>
              <div className="text-xs text-ink-faint mt-0.5">
                {b.headlineCaption}
                {b.detail ? ` · ${b.detail}` : ""}
              </div>
              <div className="h-1 rounded bg-surface-sunken mt-2">
                <div className="h-1 rounded" style={{ width: `${(b.value / max) * 100}%`, backgroundColor: heatColor(norm(b.value, max)) }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
