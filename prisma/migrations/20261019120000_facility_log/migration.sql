-- CreateEnum
CREATE TYPE "FacilityLogKind" AS ENUM ('EVENT', 'OBSERVATION', 'INSIGHT');

-- CreateEnum
CREATE TYPE "FacilityEventType" AS ENUM ('RETIRO_SLOT', 'LIBERACION_TARDIA', 'OFERTA_RESIDUAL', 'PEDIDO', 'TRATO_INADECUADO', 'SIN_RESPUESTA', 'POSITIVO', 'QUEJA_JUGADOR', 'INCUMPLIMIENTO_PLEI');

-- CreateEnum
CREATE TYPE "FacilityLogTone" AS ENUM ('CORDIAL', 'TENSE', 'HOSTILE');

-- CreateEnum
CREATE TYPE "FacilityLogSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "FacilityInsightKind" AS ENUM ('EXPECT', 'HOW_TO_WORK', 'IMPROVE');

-- CreateTable
CREATE TABLE "facility_log_entries" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" "FacilityLogKind" NOT NULL,
    "occurredAt" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "eventType" "FacilityEventType",
    "subtype" TEXT,
    "tone" "FacilityLogTone",
    "resolution" TEXT,
    "usedData" BOOLEAN,
    "committedSlot" BOOLEAN,
    "hours" INTEGER,
    "hoursSincePublished" INTEGER,
    "playersSigned" INTEGER,
    "severity" INTEGER,
    "gameId" INTEGER,
    "topic" TEXT,
    "sentiment" "FacilityLogSentiment",
    "insightKind" "FacilityInsightKind",
    "evidenceUrl" TEXT,
    "legacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_log_reactions" (
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agrees" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facility_log_reactions_pkey" PRIMARY KEY ("entryId","userId")
);

-- CreateTable
CREATE TABLE "facility_log_replies" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facility_log_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facility_log_entries_legacyId_key" ON "facility_log_entries"("legacyId");

-- CreateIndex
CREATE INDEX "facility_log_entries_facilityId_occurredAt_idx" ON "facility_log_entries"("facilityId", "occurredAt");

-- CreateIndex
CREATE INDEX "facility_log_entries_occurredAt_idx" ON "facility_log_entries"("occurredAt");

-- CreateIndex
CREATE INDEX "facility_log_replies_entryId_createdAt_idx" ON "facility_log_replies"("entryId", "createdAt");

-- AddForeignKey
ALTER TABLE "facility_log_entries" ADD CONSTRAINT "facility_log_entries_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_log_entries" ADD CONSTRAINT "facility_log_entries_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_log_reactions" ADD CONSTRAINT "facility_log_reactions_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "facility_log_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_log_reactions" ADD CONSTRAINT "facility_log_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_log_replies" ADD CONSTRAINT "facility_log_replies_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "facility_log_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_log_replies" ADD CONSTRAINT "facility_log_replies_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copia de las filas de la bitácora mínima anterior (facility_relationship_events). No encajan en el catálogo de
-- eventos nuevo, así que entran como observaciones neutras con el tipo viejo como tema. La tabla vieja se conserva
-- sin tocar (ya no se escribe) hasta confirmar que la copia quedó bien.
INSERT INTO "facility_log_entries"
    ("id", "facilityId", "authorId", "kind", "occurredAt", "text", "topic", "sentiment", "evidenceUrl", "legacyId", "createdAt", "updatedAt")
SELECT
    'legacy_' || e."id",
    p."facilityId",
    u."id",
    'OBSERVATION',
    e."date",
    e."note",
    CASE e."type"
        WHEN 'EVENT' THEN 'Evento'
        WHEN 'AGREEMENT' THEN 'Acuerdo'
        ELSE CASE WHEN e."status" = 'CLOSED' THEN 'Pendiente (cerrado)' ELSE 'Pendiente (abierto)' END
    END,
    'NEUTRAL',
    e."attachmentUrl",
    e."id",
    e."createdAt",
    e."createdAt"
FROM "facility_relationship_events" e
JOIN "facility_profiles" p ON p."id" = e."facilityProfileId"
LEFT JOIN "users" u ON u."id" = e."createdByUserId";
