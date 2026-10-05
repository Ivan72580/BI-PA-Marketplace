-- CreateEnum
CREATE TYPE "RateUnit" AS ENUM ('PER_HOUR', 'PER_PLAYER', 'FLAT_FEE');

-- AlterTable
ALTER TABLE "games" ADD COLUMN "fieldName" TEXT;

-- AlterTable
ALTER TABLE "facility_profiles"
  ADD COLUMN "rateUnit" "RateUnit",
  ADD COLUMN "pricingRawText" TEXT,
  ADD COLUMN "ratesVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "address" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "facilityTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "isActive" BOOLEAN;

-- CreateIndex
CREATE INDEX "games_facilityId_fieldName_idx" ON "games"("facilityId", "fieldName");
