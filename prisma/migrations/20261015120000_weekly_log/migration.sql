-- CreateTable
CREATE TABLE "weekly_log_entries" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "topic" TEXT,
    "facilityId" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weekly_log_entries_date_idx" ON "weekly_log_entries"("date");

-- CreateIndex
CREATE INDEX "weekly_log_entries_facilityId_idx" ON "weekly_log_entries"("facilityId");

-- AddForeignKey
ALTER TABLE "weekly_log_entries" ADD CONSTRAINT "weekly_log_entries_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_log_entries" ADD CONSTRAINT "weekly_log_entries_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
