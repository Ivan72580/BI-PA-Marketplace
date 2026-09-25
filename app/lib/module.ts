// Los dos módulos de la app — ver comentario del enum AppModule en
// schema.prisma. Mismo criterio que i18n/config.ts para locale: constantes
// y helpers acá, para no repetir el nombre de la cookie ni los valores
// válidos en cada lugar que los usa.
export const APP_MODULES = ["MAGIC", "EXECUTIVE"] as const;
export type AppModule = (typeof APP_MODULES)[number];

export const MODULE_COOKIE = "plei_last_module";

export function isAppModule(value: string | undefined | null): value is AppModule {
  return !!value && (APP_MODULES as readonly string[]).includes(value);
}
