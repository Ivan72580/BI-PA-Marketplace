// Helpers de tema del lado del cliente. Los colores reales viven en
// globals.css como variables --c-*; acá solo se leen, para lo que no puede
// usar CSS directamente (canvas de Chart.js, marcadores de Leaflet).

import { THEME_COOKIE, THEME_EVENT, themeAttribute, type Theme } from "./theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

// Guarda la preferencia y la aplica al instante, sin recargar ni ir al
// servidor: la cookie es solo para que el próximo render del servidor ya
// salga con el tema correcto.
export function applyTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  const attr = themeAttribute(theme);
  if (attr) document.documentElement.setAttribute("data-theme", attr);
  else document.documentElement.removeAttribute("data-theme");
  notifyThemeChange();
}

export function notifyThemeChange() {
  window.dispatchEvent(new Event(THEME_EVENT));
}

// Se suscribe a cualquier cambio del tema efectivo: el selector, el modo
// del sistema operativo (relevante cuando la preferencia es "Sistema") y el
// forzado a claro de Reportes/impresión. Devuelve la función para desuscribirse.
export function onThemeChange(callback: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(THEME_EVENT, callback);
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    media.removeEventListener("change", callback);
  };
}

// Lee un token de color (--c-<name>) tal como resolvió en `el` — por defecto
// la raíz. Pasar el elemento importa cuando está dentro de un subárbol
// forzado a claro (data-theme="light").
export function readToken(name: string, el?: Element | null): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(el ?? document.documentElement).getPropertyValue(`--c-${name}`).trim();
}

/** Convierte un color (hex, rgb(), rgba() o un triplete "r g b") en rgba() con la opacidad indicada. */
export function toRgba(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const nums = color.match(/[\d.]+/g);
  if (nums && nums.length >= 3) {
    return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${alpha})`;
  }
  return color;
}

// Token + opacidad opcional, resuelto a un color concreto.
export function themeColor(name: string, alpha?: number, el?: Element | null): string {
  const raw = readToken(name, el);
  if (!raw) return "";
  // Tripletes "r g b" (los del heatmap) siempre salen como rgba.
  if (/^\d+\s+\d+\s+\d+$/.test(raw)) return toRgba(raw, alpha ?? 1);
  return alpha === undefined ? raw : toRgba(raw, alpha);
}
