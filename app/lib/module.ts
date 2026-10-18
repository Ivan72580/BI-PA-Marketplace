// Registro de módulos de la app — la única fuente de verdad sobre qué rutas
// pertenecen a qué módulo, cuál es su página de inicio y con qué nivel entra
// una cuenta que no tiene una fila propia en UserModuleAccess. Lo usan el
// gate de cada sección (gateModule), el menú (TopNav), /entrada,
// ModuleTracker, el mail semanal y la matriz de /admin/users.
//
// Sumar un módulo: agregarlo al enum AppModule (schema.prisma + migración),
// acá en MODULES, sus textos en messages/*.json (namespace Modules) y un
// layout.tsx con gateModule() en cada carpeta de ruta nueva.
//
// Lógica pura (sin Prisma): se importa también desde componentes cliente.

export const APP_MODULES = ["MAGIC", "TEAM", "EXECUTIVE"] as const;
export type AppModule = (typeof APP_MODULES)[number];

export const MODULE_LEVELS = ["NONE", "VIEW", "EDIT"] as const;
export type ModuleLevel = (typeof MODULE_LEVELS)[number];
export type ModuleAccess = Record<AppModule, ModuleLevel>;

type ModuleDef = {
  home: string;
  // Primer segmento de ruta de cada sección del módulo ("/" = solo la raíz).
  routes: string[];
  // Nivel de una cuenta sin fila en UserModuleAccess (cuentas nuevas).
  defaultLevel: ModuleLevel;
  // Niveles que tienen sentido en este módulo (los que ofrece Admin).
  levels: ModuleLevel[];
};

export const MODULES: Record<AppModule, ModuleDef> = {
  MAGIC: {
    home: "/",
    routes: ["/", "/trends", "/daily", "/seasonality", "/forecast", "/market", "/map", "/inventory", "/funnel"],
    defaultLevel: "VIEW",
    levels: ["NONE", "VIEW"], // solo lectura: no hay datos manuales que editar
  },
  TEAM: {
    home: "/weekly-log",
    routes: ["/weekly-log", "/facility-log"],
    defaultLevel: "EDIT",
    levels: ["NONE", "VIEW", "EDIT"], // EDIT = anotar en el Registro semanal y en la Bitácora de Facilities
  },
  EXECUTIVE: {
    home: "/panel-ejecutivo",
    routes: ["/panel-ejecutivo"],
    defaultLevel: "NONE",
    levels: ["NONE", "VIEW", "EDIT"], // EDIT = editar el Facility Profile
  },
};

// Rutas que no son de ningún módulo y deciden su acceso por su cuenta:
// /reports (cada reporte según su módulo), /admin (Role.ADMIN), /entrada,
// /sin-acceso, /login y /api.

export const MODULE_COOKIE = "plei_last_module";

export function isAppModule(value: string | undefined | null): value is AppModule {
  return !!value && (APP_MODULES as readonly string[]).includes(value);
}

export function isModuleLevel(value: string | undefined | null): value is ModuleLevel {
  return !!value && (MODULE_LEVELS as readonly string[]).includes(value);
}

const RANK: Record<ModuleLevel, number> = { NONE: 0, VIEW: 1, EDIT: 2 };

export function hasLevel(level: ModuleLevel | undefined, min: ModuleLevel): boolean {
  return RANK[level ?? "NONE"] >= RANK[min];
}

// Filas guardadas + defaults = acceso efectivo a cada módulo.
export function resolveAccess(rows: { module: string; level: string }[]): ModuleAccess {
  const access = Object.fromEntries(APP_MODULES.map((m) => [m, MODULES[m].defaultLevel])) as ModuleAccess;
  for (const r of rows) if (isAppModule(r.module) && isModuleLevel(r.level)) access[r.module] = r.level;
  return access;
}

export function moduleForPath(pathname: string): AppModule | null {
  const first = "/" + (pathname.split("/")[1] ?? "");
  for (const m of APP_MODULES) if (MODULES[m].routes.includes(first)) return m;
  return null;
}

// Página de inicio del primer módulo que la persona puede ver (orden de
// APP_MODULES), salteando `except`. null = no puede ver ninguno.
export function firstAccessibleHome(access: ModuleAccess, except?: AppModule): string | null {
  for (const m of APP_MODULES) if (m !== except && hasLevel(access[m], "VIEW")) return MODULES[m].home;
  return null;
}
