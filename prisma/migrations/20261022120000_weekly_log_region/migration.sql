-- Registro semanal por región: cada nota queda asociada a una región para poder dividir el trabajo por equipo.
ALTER TABLE "weekly_log_entries" ADD COLUMN "regionId" TEXT;

-- Las notas que ya apuntan a una facility heredan la región de su market.
UPDATE "weekly_log_entries" w
SET "regionId" = m."regionId"
FROM "facilities" f
JOIN "markets" m ON m."id" = f."marketId"
WHERE w."facilityId" = f."id";

CREATE INDEX "weekly_log_entries_regionId_idx" ON "weekly_log_entries"("regionId");

ALTER TABLE "weekly_log_entries" ADD CONSTRAINT "weekly_log_entries_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
