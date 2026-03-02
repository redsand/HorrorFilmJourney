-- CreateTable
CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "displayName" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tolerance" INTEGER NOT NULL DEFAULT 3,
  "pacePreference" TEXT,
  "horrorDNA" JSON,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Movie" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tmdbId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "year" INTEGER,
  "posterUrl" TEXT,
  "genres" JSON,
  "director" TEXT,
  "castTop" JSON,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserMovieInteraction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "movieId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "rating" INTEGER,
  "intensity" INTEGER,
  "emotions" JSON,
  "workedBest" JSON,
  "agedWell" TEXT,
  "recommend" BOOLEAN,
  "note" TEXT,
  "recommendationItemId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMovieInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserMovieInteraction_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserMovieInteraction_recommendationItemId_fkey" FOREIGN KEY ("recommendationItemId") REFERENCES "RecommendationItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecommendationBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "journeyNode" TEXT,
  "rationale" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecommendationItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "movieId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "whyImportant" TEXT NOT NULL,
  "whatItTeaches" TEXT NOT NULL,
  "historicalContext" TEXT NOT NULL,
  "nextStepHint" TEXT NOT NULL,
  "watchFor" JSON NOT NULL,
  "reception" JSON,
  "castHighlights" JSON,
  "streaming" JSON,
  "spoilerPolicy" TEXT NOT NULL,
  CONSTRAINT "RecommendationItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RecommendationBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecommendationItem_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_tmdbId_key" ON "Movie"("tmdbId");

-- CreateIndex
CREATE INDEX "UserMovieInteraction_userId_createdAt_idx" ON "UserMovieInteraction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationBatch_userId_createdAt_idx" ON "RecommendationBatch"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationItem_batchId_movieId_key" ON "RecommendationItem"("batchId", "movieId");
