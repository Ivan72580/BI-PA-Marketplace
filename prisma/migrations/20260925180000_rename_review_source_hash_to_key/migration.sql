-- RenameColumn
-- sourceHash pasa a reviewKey: dejó de ser un hash de TODO el contenido de
-- la fila (que solo servía para descartar duplicados exactos) y pasa a ser
-- un hash de un subconjunto de columnas que identifican "la misma review"
-- entre exportaciones — así una edición se detecta como actualización en
-- vez de insertarse como una fila nueva. Ver el comentario en
-- schema.prisma. No hay datos reales cargados en estas tablas todavía, así
-- que el rename no tiene ningún dato que migrar.
ALTER TABLE "game_reviews" RENAME COLUMN "sourceHash" TO "reviewKey";
ALTER INDEX "game_reviews_sourceHash_key" RENAME TO "game_reviews_reviewKey_key";

ALTER TABLE "app_reviews" RENAME COLUMN "sourceHash" TO "reviewKey";
ALTER INDEX "app_reviews_sourceHash_key" RENAME TO "app_reviews_reviewKey_key";
