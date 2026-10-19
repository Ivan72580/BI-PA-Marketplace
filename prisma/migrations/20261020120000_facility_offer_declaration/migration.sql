-- CreateEnum
CREATE TYPE "FacilityOfferModality" AS ENUM ('BLOCKED_RECURRING', 'RECURRING', 'DAILY_VARIABLE', 'RESIDUAL_ONLY');

-- CreateTable
CREATE TABLE "facility_offer_declarations" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "authorId" TEXT,
    "modality" "FacilityOfferModality" NOT NULL,
    "otherOrganizers" BOOLEAN,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facility_offer_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "facility_offer_declarations_facilityId_createdAt_idx" ON "facility_offer_declarations"("facilityId", "createdAt");

-- AddForeignKey
ALTER TABLE "facility_offer_declarations" ADD CONSTRAINT "facility_offer_declarations_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_offer_declarations" ADD CONSTRAINT "facility_offer_declarations_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
