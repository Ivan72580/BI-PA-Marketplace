#!/usr/bin/env node
// Genera el mapa de arquitectura interactivo del proyecto.
//
//   node scripts/architecture-map/build.mjs [salida.html]
//
// Lee el código real (imports, rutas, uso de Prisma, caché) y produce un HTML
// autocontenido (sin dependencias, funciona sin conexión). No toca la base de
// datos ni ejecuta la app: solo analiza archivos de texto.
//
// Límites conocidos (por ser un análisis estático sin compilador):
//   - Los imports se detectan por texto. Cubre `import`, `export ... from` e
//     `import("...")`. No ve imports construidos dinámicamente con variables.
//   - El acceso a tablas se infiere de `prisma.<modelo>.<método>(...)`. Si algún
//     día se accede por otra vía (SQL crudo, alias), no aparecería.
//   - Lo que muestra es estructura (quién usa a quién), no el flujo en ejecución.

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const OUT = resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) ?? join(ROOT, "docs", "architecture-map.html"));

const EXT = [".ts", ".tsx", ".mjs"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "prisma/migrations", "public", "messages", "docs"]);

// Conceptos con una única definición en el código. Se muestran como atajos:
// al elegirlos, el mapa resalta dónde se define y quién depende de ellos.
const CONCEPTS = [
  {
    id: "tasa-demanda",
    name: "Tasa de demanda",
    file: "app/lib/metrics.ts",
    summary: "Confirmados ÷ (confirmados + cancelaciones por demanda). Única definición; separa cancelaciones de demanda, cancha no disponible, operativas y de plugin.",
  },
  {
    id: "si-o-si",
    name: "\"Sí o sí\"",
    file: "app/lib/mustSchedule.ts",
    summary: "Slot que conviene agendar sí o sí: ventana de 3 meses, tasa de demanda > 55 % y muestra mínima de 3.",
  },
  {
    id: "indice-estacional",
    name: "Índice estacional",
    file: "app/lib/seasonPlanCalc.ts",
    summary: "Índice de volumen de demanda ajustado por crecimiento, temporadas altas/bajas agrupadas y plan de reservas.",
  },
  {
    id: "cache",
    name: "Caché de consultas",
    file: "app/lib/db/cache.ts",
    summary: "cached() con 30 min y cachedWeekly() con 7 días. Se invalida por tag desde el botón de admin, /api/revalidate o el import.",
  },
  {
    id: "proyeccion",
    name: "Proyección del mes",
    file: "app/lib/db/projection.ts",
    summary: "Solo el mes en curso, según los días con datos importados. Respeta región, market y facility; ignora el período.",
  },
  {
    id: "frescura",
    name: "Frescura de datos",
    file: "app/lib/db/freshness.ts",
    summary: "Fecha del último partido importado; alimenta el indicador discreto de la barra superior y la proyección.",
  },
];

// ---------- utilidades ----------
const toPosix = (p) => p.split(sep).join("/");
const read = (p) => readFileSync(p, "utf8");

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = toPosix(relative(ROOT, abs));
    if (SKIP_DIRS.has(name) || SKIP_DIRS.has(rel)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, acc);
    else if (EXT.some((e) => name.endsWith(e)) && !name.endsWith(".d.ts")) acc.push(rel);
  }
  return acc;
}

// Quita comentarios y literales de plantilla simples para no detectar imports
// o `prisma.x` que solo aparecen en texto comentado.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1);
}

function firstComment(src) {
  const lines = src.split("\n");
  let i = 0;
  while (i < lines.length && /^\s*(["']use (client|server)["'];?)?\s*$/.test(lines[i])) i++;
  const out = [];
  if (lines[i] && /^\s*\/\*/.test(lines[i])) {
    for (; i < lines.length; i++) {
      out.push(lines[i].replace(/^\s*\/?\*+\/?\s?/, "").replace(/\*\/\s*$/, ""));
      if (/\*\//.test(lines[i])) break;
    }
  } else {
    for (; i < lines.length && /^\s*\/\//.test(lines[i]); i++) out.push(lines[i].replace(/^\s*\/\/+\s?/, ""));
  }
  const text = out.join(" ").replace(/[─═\-=]{3,}/g, " ").replace(/\s+/g, " ").trim();
  if (!text || /^(eslint|@ts-|prettier)/i.test(text)) return "";
  return text.length > 260 ? text.slice(0, 257).replace(/\s+\S*$/, "") + "…" : text;
}

// ---------- 1. archivos ----------
const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "scripts")), ...walk(join(ROOT, "i18n"))]
  .concat(["middleware.ts"].filter((f) => { try { statSync(join(ROOT, f)); return true; } catch { return false; } }))
  .filter((f) => !f.startsWith("scripts/architecture-map/"))
  .sort();
const fileSet = new Set(files);

function layerOf(rel) {
  if (rel === "middleware.ts") return "route";
  if (/^app\/(?:.*\/)?(page|layout|route)\.tsx?$/.test(rel) && !rel.startsWith("app/components/") && !rel.startsWith("app/lib/")) return "route";
  if (rel.startsWith("app/components/") || rel.startsWith("app/context/")) return "component";
  if (rel.startsWith("app/lib/actions/")) return "action";
  if (rel.startsWith("app/lib/db/")) return "query";
  if (rel.startsWith("app/lib/") || rel.startsWith("i18n/")) return "logic";
  if (rel.startsWith("scripts/")) return "script";
  return "logic";
}

function labelOf(rel, layer) {
  if (layer === "route") {
    if (rel === "middleware.ts") return { label: "middleware", sub: "todas las rutas" };
    const m = rel.match(/^app\/(.*?)\/?(page|layout|route)\.tsx?$/);
    const url = "/" + (m ? m[1] : "");
    const kind = m ? m[2] : "page";
    const clean = url.length > 1 ? url.replace(/\/$/, "") : url;
    return { label: clean, sub: kind === "page" ? "pantalla" : kind === "layout" ? "layout" : "endpoint API" };
  }
  const root = { component: "app/components/", action: "app/lib/actions/", query: "app/lib/db/", logic: "app/lib/", script: "scripts/" }[layer];
  let short = rel.startsWith(root) ? rel.slice(root.length) : rel;
  const dir = short.includes("/") ? short.slice(0, short.lastIndexOf("/") + 1) : "";
  const base = short.slice(short.lastIndexOf("/") + 1).replace(/\.(tsx?|mjs)$/, "");
  return { label: base, sub: dir ? dir.replace(/\/$/, "") : "" };
}

// ---------- 2. modelos Prisma ----------
const schema = read(join(ROOT, "prisma", "schema.prisma"));
const models = [];
for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const name = m[1];
  const body = m[2];
  const fieldLines = body.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"));
  models.push({ name, fieldLines });
}
const modelNames = new Set(models.map((m) => m.name));
for (const m of models) {
  m.fields = m.fieldLines.length;
  m.relations = [...new Set(
    m.fieldLines
      .map((l) => l.split(/\s+/)[1]?.replace(/[?\[\]]/g, ""))
      .filter((t) => t && modelNames.has(t) && t !== m.name)
  )];
  delete m.fieldLines;
}
const modelKey = (n) => n[0].toLowerCase() + n.slice(1);
const modelByKey = new Map(models.map((m) => [modelKey(m.name), m.name]));
const READ_M = new Set(["findMany", "findFirst", "findUnique", "findFirstOrThrow", "findUniqueOrThrow", "groupBy", "count", "aggregate"]);
const WRITE_M = new Set(["create", "createMany", "upsert", "update", "updateMany", "delete", "deleteMany"]);

// ---------- 3. análisis por archivo ----------
const info = new Map(); // rel -> datos
const EXPORT_DECL = /export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(function\*?|const|let|var|class|interface|type|enum)\s+(\w+)/g;

for (const rel of files) {
  const raw = read(join(ROOT, rel));
  const src = stripComments(raw);
  const exports = [];
  for (const m of src.matchAll(EXPORT_DECL)) exports.push({ name: m[2], kind: m[1] });
  for (const m of src.matchAll(/export\s*(type\s*)?\{([^}]*)\}(?!\s*from)/g)) {
    for (const part of m[2].split(",")) {
      const nm = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop();
      if (nm) exports.push({ name: nm, kind: m[1] ? "type" : "const" });
    }
  }
  if (/export\s+default\b/.test(src) && !exports.some((e) => e.name === "default")) exports.push({ name: "default", kind: "default" });

  // imports
  const imports = []; // {spec, names:[...]|"*"|["default"], typeOnly}
  for (const m of src.matchAll(/import\s+(type\s+)?([\w*{}\s,$]+?)\s+from\s*["']([^"']+)["']/g)) {
    imports.push({ spec: m[3], clause: m[2], typeOnly: !!m[1] });
  }
  for (const m of src.matchAll(/import\s*["']([^"']+)["']/g)) imports.push({ spec: m[1], clause: "", typeOnly: false });
  for (const m of src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) imports.push({ spec: m[1], clause: "*", typeOnly: false });
  const reexports = [];
  for (const m of src.matchAll(/export\s+(type\s+)?(\*|\{[^}]*\})(?:\s+as\s+\w+)?\s+from\s*["']([^"']+)["']/g)) {
    const names = m[2] === "*" ? "*" : m[2].replace(/[{}]/g, "").split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).filter(Boolean);
    reexports.push({ spec: m[3], names, typeOnly: !!m[1] });
  }

  // prisma
  const reads = new Set();
  const writes = new Set();
  for (const m of src.matchAll(/\b(?:prisma|tx|db)\.(\w+)\.(\w+)\s*[(<]/g)) {
    const model = modelByKey.get(m[1]);
    if (!model) continue;
    if (READ_M.has(m[2])) reads.add(model);
    else if (WRITE_M.has(m[2])) writes.add(model);
  }

  // caché
  const cachedFns = [];
  for (const m of src.matchAll(/export\s+const\s+(\w+)\s*=\s*(cached|cachedWeekly)\s*\(/g)) {
    cachedFns.push({ name: m[1], ttl: m[2] === "cachedWeekly" ? "7 días" : "30 min" });
  }

  // traducciones
  const ns = new Set();
  for (const m of src.matchAll(/(?:useTranslations|getTranslations)\(\s*["']([\w.]+)["']\s*\)/g)) ns.add(m[1]);
  for (const m of src.matchAll(/getTranslations\(\s*\{[^}]*namespace:\s*["']([\w.]+)["']/g)) ns.add(m[1]);

  const layer = layerOf(rel);
  const lab = labelOf(rel, layer);
  info.set(rel, {
    id: rel,
    layer,
    label: lab.label,
    sub: lab.sub,
    loc: raw.split("\n").length,
    desc: firstComment(raw),
    client: /^\s*["']use client["']/m.test(raw.slice(0, 400)),
    server: /^\s*["']use server["']/m.test(raw.slice(0, 400)),
    exports,
    imports,
    reexports,
    reads: [...reads].sort(),
    writes: [...writes].sort(),
    cached: cachedFns,
    ns: [...ns].sort(),
    deps: new Set(),
  });
}

// ---------- 4. resolución de imports ----------
function resolveSpec(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = toPosix(join(dirname(from), spec));
  else return null; // paquete npm
  base = toPosix(base).replace(/^\.\//, "");
  const cands = [base, ...EXT.map((e) => base + e), ...EXT.map((e) => base + "/index" + e)];
  return cands.find((c) => fileSet.has(c)) ?? null;
}

function packageOf(spec) {
  if (spec.startsWith("@")) return spec.split("/").slice(0, 2).join("/");
  return spec.split("/")[0];
}

function parseClause(clause) {
  // devuelve lista de nombres importados ("*" si es namespace)
  if (!clause) return [];
  if (clause === "*" || /\*\s+as/.test(clause)) return ["*"];
  const names = [];
  const braces = clause.match(/\{([^}]*)\}/);
  if (braces) {
    for (const part of braces[1].split(",")) {
      const p = part.trim();
      if (!p || /^type\s/.test(p)) continue; // import { type X } no es uso en ejecución
      names.push(p.split(/\s+as\s+/)[0].trim());
    }
  }
  const def = clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
  if (def) names.push("default");
  return names;
}

// símbolo -> archivo donde realmente se declara, atravesando barrels
function resolveSymbol(file, name, seen = new Set()) {
  const key = file + "#" + name;
  if (seen.has(key)) return null;
  seen.add(key);
  const fi = info.get(file);
  if (!fi) return null;
  if (fi.exports.some((e) => e.name === name)) return file;
  for (const re of fi.reexports) {
    if (re.names !== "*" && !re.names.includes(name)) continue;
    const target = resolveSpec(file, re.spec);
    if (!target) continue;
    const hit = resolveSymbol(target, name, seen);
    if (hit) return hit;
  }
  return null;
}

const edgeMap = new Map(); // "s>t" -> {s,t,n}
function addEdge(s, t) {
  if (s === t) return;
  const k = s + ">" + t;
  const e = edgeMap.get(k) ?? { s, t, n: 0 };
  e.n++;
  edgeMap.set(k, e);
}

for (const [rel, fi] of info) {
  for (const imp of fi.imports) {
    const target = resolveSpec(rel, imp.spec);
    if (!target) {
      if (!imp.spec.startsWith(".") && !imp.spec.startsWith("@/")) fi.deps.add(packageOf(imp.spec));
      continue;
    }
    if (imp.typeOnly) continue; // solo tipos: no existe en ejecución
    const names = parseClause(imp.clause);
    const tInfo = info.get(target);
    const isBarrel = tInfo.reexports.length > 0 && tInfo.exports.length === 0;
    if (isBarrel && names.length && !names.includes("*")) {
      // barrel: conectar con los archivos donde viven los símbolos
      let any = false;
      for (const n of names) {
        const real = resolveSymbol(target, n);
        if (real) { addEdge(rel, real); any = true; }
      }
      if (!any) addEdge(rel, target);
    } else if (names.length || imp.clause === "" || imp.clause === "*") {
      addEdge(rel, target);
    }
  }
}

// barrels fuera del mapa (son pura redirección)
const barrels = new Set([...info.values()].filter((f) => f.reexports.length && f.exports.length === 0).map((f) => f.id));
const nodeIds = [...info.keys()].filter((id) => !barrels.has(id));
const nodeSet = new Set(nodeIds);

// ---------- 5. nodos de modelo y aristas de datos ----------
const edges = [];
for (const e of edgeMap.values()) if (nodeSet.has(e.s) && nodeSet.has(e.t)) edges.push({ s: e.s, t: e.t, k: "uses" });
for (const id of nodeIds) {
  const fi = info.get(id);
  for (const m of fi.reads) edges.push({ s: id, t: "model:" + m, k: "reads" });
  for (const m of fi.writes) edges.push({ s: id, t: "model:" + m, k: "writes" });
}

// ---------- 6. métricas de grafo ----------
const inDeg = new Map();
for (const e of edges) inDeg.set(e.t, (inDeg.get(e.t) ?? 0) + 1);

const nodes = nodeIds.map((id) => {
  const fi = info.get(id);
  return {
    id,
    layer: fi.layer,
    label: fi.label,
    sub: fi.sub,
    loc: fi.loc,
    desc: fi.desc,
    client: fi.client,
    server: fi.server,
    exports: fi.exports.filter((e) => e.kind !== "default").map((e) => e.name).slice(0, 30),
    exportCount: fi.exports.length,
    cached: fi.cached,
    ns: fi.ns,
    deps: [...fi.deps].sort(),
    reads: fi.reads,
    writes: fi.writes,
    inDeg: inDeg.get(id) ?? 0,
  };
});
for (const m of models) {
  nodes.push({
    id: "model:" + m.name,
    layer: "model",
    label: m.name,
    sub: m.fields + " campos",
    loc: 0,
    desc: m.relations.length ? "Se relaciona con " + m.relations.join(", ") + "." : "",
    client: false,
    server: false,
    exports: [],
    exportCount: 0,
    cached: [],
    ns: [],
    deps: [],
    reads: [],
    writes: [],
    relations: m.relations,
    inDeg: inDeg.get("model:" + m.name) ?? 0,
  });
}

// Nodos transversales: los usan tantos archivos que dibujar todas sus
// aristas tapa el resto. Se listan en el panel pero no se dibujan por defecto.
const HUB_MIN = 14;
for (const n of nodes) n.hub = n.layer !== "route" && n.layer !== "model" && n.inDeg >= HUB_MIN;

let commit = "";
try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch {}
let subject = "";
try { subject = execSync("git log -1 --format=%s", { cwd: ROOT }).toString().trim(); } catch {}

// El barrel app/lib/db/queries.ts documenta cada archivo de consultas en su
// cabecera ("//   nombre.ts  - descripción"): se usa como descripción cuando
// el archivo no tiene comentario propio.
try {
  const head = read(join(ROOT, "app/lib/db/queries.ts"));
  for (const m of head.matchAll(/^\/\/\s{2,}(\w+\.ts)\s*-\s*(.+)$/gm)) {
    const n = nodes.find((x) => x.id === "app/lib/db/" + m[1]);
    if (n && !n.desc) n.desc = m[2].trim();
  }
} catch {}

// Archivos que nadie importa. Se excluyen los que carga el framework por
// convención (rutas, i18n/request.ts) y los scripts, que se ejecutan a mano.
const FRAMEWORK_LOADED = new Set(["i18n/request.ts"]);
const used = new Set(edges.map((e) => e.t));
for (const n of nodes) {
  n.orphan = !["route", "script", "model"].includes(n.layer) && !used.has(n.id) && !FRAMEWORK_LOADED.has(n.id);
}

const concepts = CONCEPTS.filter((c) => nodeSet.has(c.file));

const data = {
  generated: new Date().toISOString().slice(0, 10),
  commit,
  subject,
  repo: "Ivan72580/BI-PA-Marketplace",
  hubMin: HUB_MIN,
  nodes,
  edges,
  concepts,
  stats: {
    orphans: nodes.filter((n) => n.orphan).length,
    files: nodeIds.length,
    edges: edges.filter((e) => e.k === "uses").length,
    models: models.length,
    routes: nodes.filter((n) => n.layer === "route" && n.sub === "pantalla").length,
  },
};

// ---------- 7. HTML ----------
const template = read(join(HERE, "template.html"));
const json = JSON.stringify(data).replace(/</g, "\\u003c");
let html = template.replace("/*__DATA__*/null", json);
if (process.argv.includes("--artifact")) {
  // El Artifact agrega su propio doctype/head/body: se entrega solo el contenido.
  html = html
    .replace(/<!doctype[^>]*>/i, "")
    .replace(/<\/?(html|head|body)[^>]*>/gi, "")
    .replace(/<meta\s+(charset|name="viewport")[^>]*>/gi, "");
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`Mapa generado: ${relative(process.cwd(), OUT)}`);
console.log(`  ${data.stats.files} archivos, ${data.stats.edges} relaciones, ${data.stats.models} modelos, ${data.stats.routes} pantallas`);
const hubs = nodes.filter((n) => n.hub).map((n) => `${n.label} (${n.inDeg})`);
console.log(`  transversales (>= ${HUB_MIN} usos): ${hubs.join(", ") || "ninguno"}`);
