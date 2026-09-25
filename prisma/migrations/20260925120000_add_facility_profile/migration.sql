-- CreateEnum
CREATE TYPE "IndoorOutdoor" AS ENUM ('INDOOR', 'OUTDOOR', 'MIXED');

-- CreateEnum
CREATE TYPE "Amenity" AS ENUM ('PARKING', 'LOCKER_ROOMS', 'SHOWERS', 'CAFETERIA_BAR', 'WIFI', 'PRO_SHOP', 'SPECTATOR_SEATING', 'AIR_CONDITIONING', 'FIRST_AID', 'SECURITY_CAMERAS', 'NIGHT_LIGHTING');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FIXED_RATE', 'REVENUE_SHARE', 'HYBRID');

-- CreateEnum
CREATE TYPE "RelationshipEventType" AS ENUM ('EVENT', 'AGREEMENT', 'ACTION_ITEM');

-- CreateEnum
CREATE TYPE "RelationshipEventStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "facility_profiles" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "fieldCount" INTEGER,
    "supportedFormats" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "indoorOutdoor" "IndoorOutdoor",
    "amenities" "Amenity"[] NOT NULL DEFAULT ARRAY[]::"Amenity"[],
    "amenitiesOther" TEXT,
    "marketRate" DOUBLE PRECISION,
    "partnershipStartDate" DATE,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "paymentTerms" TEXT,
    "bookingTerms" TEXT,
    "cancellationTerms" TEXT,
    "depositAmount" DOUBLE PRECISION,
    "depositNotes" TEXT,
    "pricingModel" "PricingModel",
    "fixedRate" DOUBLE PRECISION,
    "revenueSharePct" DOUBLE PRECISION,
    "discountAmount" DOUBLE PRECISION,
    "discountPct" DOUBLE PRECISION,
    "freeHoursPerMonth" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_peak_windows" (
    "id" TEXT NOT NULL,
    "facilityProfileId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,

    CONSTRAINT "facility_peak_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_relationship_events" (
    "id" TEXT NOT NULL,
    "facilityProfileId" TEXT NOT NULL,
    "type" "RelationshipEventType" NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT NOT NULL,
    "status" "RelationshipEventStatus",
    "attachmentUrl" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facility_relationship_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facility_profiles_facilityId_key" ON "facility_profiles"("facilityId");

-- CreateIndex
CREATE INDEX "facility_peak_windows_facilityProfileId_idx" ON "facility_peak_windows"("facilityProfileId");

-- CreateIndex
CREATE INDEX "facility_relationship_events_facilityProfileId_idx" ON "facility_relationship_events"("facilityProfileId");

-- CreateIndex
CREATE INDEX "facility_relationship_events_facilityProfileId_type_idx" ON "facility_relationship_events"("facilityProfileId", "type");

-- AddForeignKey
ALTER TABLE "facility_profiles" ADD CONSTRAINT "facility_profiles_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_peak_windows" ADD CONSTRAINT "facility_peak_windows_facilityProfileId_fkey" FOREIGN KEY ("facilityProfileId") REFERENCES "facility_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_relationship_events" ADD CONSTRAINT "facility_relationship_events_facilityProfileId_fkey" FOREIGN KEY ("facilityProfileId") REFERENCES "facility_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
