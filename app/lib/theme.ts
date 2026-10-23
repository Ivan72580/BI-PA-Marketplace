// Preferencia de tema (Claro / Oscuro / Sistema). Vive solo en una cookie por
// navegador — decisión explícita: no se guarda en User, no hace falta que viaje
// entre dispositivos. El layout raíz lee la cookie del lado del servidor y
// pone <html data-theme="..."> en el HTML inicial, así la página no se pinta
// en claro un instante antes de pasar a oscuro.
//
// "system" = sin atributo: decide prefers-color-scheme (ver globals.css).

export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];

export const THEME_COOKIE = "theme";

// Evento que se dispara en window cuando cambia el tema efectivo (por el
// selector o porque el sistema operativo cambió y la preferencia es "system").
// Lo escuchan los gráficos de canvas (Chart.js) y los mapas, que no leen CSS
// por sí solos y necesitan redibujarse.
export const THEME_EVENT = "plei:themechange";

export function isTheme(value: string | undefined | null): value is Theme {
  return !!value && (themes as readonly string[]).includes(value);
}

// Valor del atributo data-theme para <html>: undefined en "system".
export function themeAttribute(theme: Theme | undefined): "light" | "dark" | undefined {
  return theme === "light" || theme === "dark" ? theme : undefined;
}
