-- CreateEnum
CREATE TYPE "GeoPrecision" AS ENUM ('ADDRESS', 'POSTAL_CODE', 'MANUAL');

-- AlterTable
ALTER TABLE "facility_profiles"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "geoPrecision" "GeoPrecision",
  ADD COLUMN "geocodedAt" TIMESTAMP(3);
