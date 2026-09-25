-- CreateEnum
CREATE TYPE "GameReviewTag" AS ENUM ('FRIENDLY_PLAYERS', 'COMPETITIVE_GAME', 'NOT_COMPETITIVE', 'GOOD_PLAYERS', 'ISSUES_WITH_OTHER_PLAYERS', 'FIELD_QUALITY_GREAT', 'FIELD_QUALITY_GOOD', 'FIELD_CONDITIONS_ISSUES');

-- CreateEnum
CREATE TYPE "AppReviewSource" AS ENUM ('IOS', 'ANDROID');

-- CreateTable
CREATE TABLE "game_reviews" (
    "id" TEXT NOT NULL,
    "gameId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "rating" INTEGER NOT NULL,
    "tags" "GameReviewTag"[] NOT NULL DEFAULT ARRAY[]::"GameReviewTag"[],
    "reviewText" TEXT,
    "playerPhoneHash" TEXT,
    "sourceHash" TEXT NOT NULL,

    CONSTRAINT "game_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_reviews" (
    "id" TEXT NOT NULL,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "source" "AppReviewSource" NOT NULL,
    "rating" INTEGER NOT NULL,
    "reviewText" TEXT,
    "replyText" TEXT,
    "replyDate" TIMESTAMP(3),
    "replied" BOOLEAN NOT NULL DEFAULT false,
    "replyTimeDays" DOUBLE PRECISION,
    "sourceHash" TEXT NOT NULL,

    CONSTRAINT "app_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_reviews_sourceHash_key" ON "game_reviews"("sourceHash");

-- CreateIndex
CREATE INDEX "game_reviews_gameId_idx" ON "game_reviews"("gameId");

-- CreateIndex
CREATE INDEX "game_reviews_playerPhoneHash_idx" ON "game_reviews"("playerPhoneHash");

-- CreateIndex
CREATE UNIQUE INDEX "app_reviews_sourceHash_key" ON "app_reviews"("sourceHash");

-- AddForeignKey
ALTER TABLE "game_reviews" ADD CONSTRAINT "game_reviews_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
