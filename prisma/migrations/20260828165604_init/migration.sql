-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CancellationCategory" AS ENUM ('NOT_ENOUGH_PLAYERS', 'FACILITY_UNAVAILABLE', 'WEATHER', 'MAINTENANCE', 'HOLIDAY', 'OTHER');

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" INTEGER NOT NULL,
    "facilityId" TEXT NOT NULL,
    "organizer" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "minPlayers" INTEGER NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "finalPlayers" INTEGER NOT NULL,
    "waitlistPlayers" INTEGER NOT NULL,
    "droppedPlayers" INTEGER NOT NULL,
    "status" "GameStatus" NOT NULL,
    "playersMissing" INTEGER,
    "cancellationReasonRaw" TEXT,
    "cancellationCategory" "CancellationCategory",
    "confirmationLeadTime" DOUBLE PRECISION,
    "eventRevenue" DOUBLE PRECISION,
    "gamePrice" DOUBLE PRECISION,
    "revenuePerPlayer" DOUBLE PRECISION,
    "ratingCount" INTEGER,
    "averageRating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "markets_name_regionId_key" ON "markets"("name", "regionId");

-- CreateIndex
CREATE INDEX "facilities_marketId_idx" ON "facilities"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "facilities_name_marketId_key" ON "facilities"("name", "marketId");

-- CreateIndex
CREATE INDEX "games_facilityId_idx" ON "games"("facilityId");

-- CreateIndex
CREATE INDEX "games_date_idx" ON "games"("date");

-- CreateIndex
CREATE INDEX "games_status_idx" ON "games"("status");

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
