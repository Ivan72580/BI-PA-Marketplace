"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "leaflet/dist/leaflet.css";
import { TILE_URL, TILE_ATTRIBUTION } from "./ZoneMap";
import { MUST_SCHEDULE_MIN_RATE } from "../lib/mustSchedule";

// Mini-mapa de la landing de Trends: una burbuja por market. Tamaño = partidos publicados del mes;
// color = tasa de demanda (verde si supera el piso del "sí o sí", rojo si no). Tocar una burbuja NO
// navega al market: lo "enfoca" (?focus=) para que el panel de al lado muestre su mejor día, horario
// y formato. Desde el panel se abre el Trends completo del market.

export type LandingBubble = {
  key: string;
  label: string;
  latitude: number;
  longitude: number;
  games: number;
  rate: number;
  approximate: boolean;
  href: string; // destino al enfocar (misma página con ?focus=)
};

const OK = "#16755c";
const LOW = "#cc3c29";

export default function LandingMap({
  bubbles,
  selectedKey,
  rateLabel,
  gamesLabel,
}: {
  bubbles: LandingBubble[];
  selectedKey: string | null;
  rateLabel: string; // ej. "Tasa de demanda"
  gamesLabel: string; // ej. "publicados"
}) {
  const router = useRouter();
  const [mapReady, setMapReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  const fittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false }).setView([37.5, -96], 4);
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
    const max = Math.max(1, ...bubbles.map((b) => b.games));
    for (const b of bubbles) {
      const color = b.rate > MUST_SCHEDULE_MIN_RATE ? OK : LOW;
      const isSel = b.key === selectedKey;
      const marker = L.circleMarker([b.latitude, b.longitude], {
        radius: 6 + Math.sqrt(b.games / max) * 24,
        color: isSel ? "#1f2937" : color,
        weight: isSel ? 3 : 1.5,
        dashArray: b.approximate ? "4 4" : undefined,
        fillColor: color,
        fillOpacity: isSel ? 0.85 : 0.55,
      });
      // Nodos de texto (no innerHTML): los nombres vienen de datos externos.
      const tip = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = b.label;
      tip.appendChild(strong);
      tip.appendChild(document.createElement("br"));
      tip.appendChild(document.createTextNode(`${rateLabel}: ${(b.rate * 100).toFixed(0)}% · ${b.games.toLocaleString("en-US")} ${gamesLabel}`));
      marker.bindTooltip(tip, { direction: "top" });
      marker.on("click", () => router.push(b.href, { scroll: false }));
      marker.addTo(layer);
    }
    if (!fittedRef.current && bubbles.length > 0) {
      map.fitBounds(L.latLngBounds(bubbles.map((b) => [b.latitude, b.longitude])), { padding: [30, 30], maxZoom: 9 });
      fittedRef.current = true;
    }
  }, [bubbles, selectedKey, rateLabel, gamesLabel, router, mapReady]);

  return <div ref={containerRef} className="h-[380px] w-full rounded-xl overflow-hidden z-0" />;
}
