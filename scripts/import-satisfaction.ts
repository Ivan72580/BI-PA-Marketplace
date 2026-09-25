/**
 * Corre los dos importadores de Player Satisfaction en secuencia (reviews
 * por partido + reviews de la app) — conveniencia para cuando ya tenés los
 * dos archivos a mano y no hace falta esperar a que auto-import.ts los
 * encuentre en Descargas con su nombre exacto de export.
 *
 * Uso:
 *   npx tsx scripts/import-satisfaction.ts [ruta-reviews-partido.csv] [ruta-reviews-app.csv]
 *
 * Sin argumentos, busca data/game-reviews.csv y data/app-reviews.csv (los
 * mismos paths que usa auto-import.ts) — copiá los archivos ahí primero, o
 * pasá la ruta real de cada uno como argumento.
 *
 * Cada importador es independiente y seguro de re-correr (dedupe por hash
 * de contenido, ver el comentario de cada script): si uno de los dos
 * archivos no existe todavía, el otro se importa igual, no se cancela todo
 * por eso.
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const PROJECT_ROOT = path.join(__dirname, "..");

const gameReviewsPath = process.argv[2] ?? path.join(PROJECT_ROOT, "data", "game-reviews.csv");
const appReviewsPath = process.argv[3] ?? path.join(PROJECT_ROOT, "data", "app-reviews.csv");

function run(label: string, scriptRelativePath: string, csvPath: string) {
  console.log(`\n${label}: ${csvPath}`);
  if (!fs.existsSync(csvPath)) {
    console.log("  No se encontró el archivo — se omite. Pasalo como argumento o copialo a esa ruta.");
    return;
  }
  execSync(`npx tsx ${scriptRelativePath} "${csvPath}"`, { stdio: "inherit", cwd: PROJECT_ROOT });
}

run("Reviews por partido", "scripts/import-game-reviews.ts", gameReviewsPath);
run("Reviews de la app", "scripts/import-app-reviews.ts", appReviewsPath);

console.log("\nListo.");
