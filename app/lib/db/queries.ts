// Este archivo quedó como punto de entrada único (barrel export) para no
// tener que tocar los imports en el resto de la app al modularizar. La
// lógica real vive separada por dominio, un archivo por página/tema:
//
//   shared.ts       - tipos y utilidades compartidas (OverviewFilters, buildWhere...)
//   cache.ts        - helper de caché (unstable_cache) que envuelve cada consulta
//   filters.ts      - opciones de filtro y resolución de nombres (breadcrumb)
//   overview.ts      - KPIs principales, rankings Pareto, insights
//   contribution.ts  - contribución al cambio (comparación entre períodos)
//   heatmap.ts       - cruce día×hora con desglose de motivos
//   gamelist.ts      - listado de partidos individuales
//   composition.ts   - composición Pareto 80/20 de confirmados
//   projection.ts    - proyección simple del mes en curso
//   extended.ts       - organizador, satisfacción, demanda, lead time, precio
//   facility.ts       - contexto, evolución temporal y tabla completa por facility
//   seasonality.ts    - serie mensual, overlay interanual e insights

export * from "./shared";
export * from "./filters";
export * from "./overview";
export * from "./contribution";
export * from "./heatmap";
export * from "./gamelist";
export * from "./composition";
export * from "./projection";
export * from "./extended";
export * from "./facility";
export * from "./seasonality";
export * from "./format";
export * from "./trends";
export * from "./market";
