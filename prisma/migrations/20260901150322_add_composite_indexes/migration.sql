-- CreateIndex
CREATE INDEX "games_date_status_idx" ON "games"("date", "status");

-- CreateIndex
CREATE INDEX "games_facilityId_status_idx" ON "games"("facilityId", "status");

-- CreateIndex
CREATE INDEX "games_facilityId_date_idx" ON "games"("facilityId", "date");
