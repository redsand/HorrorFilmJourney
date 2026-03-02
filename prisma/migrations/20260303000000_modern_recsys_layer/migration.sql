-- CreateTable
CREATE TABLE "MovieEmbedding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "movieId" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "dim" INTEGER NOT NULL,
  "vectorJson" JSON NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MovieEmbedding_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserEmbeddingSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "dim" INTEGER NOT NULL,
  "vectorJson" JSON NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserEmbeddingSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidencePacket" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "movieId" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "snippet" TEXT NOT NULL,
  "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hash" TEXT,
  CONSTRAINT "EvidencePacket_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecommendationDiagnostics" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "candidateCount" INTEGER NOT NULL,
  "excludedSeenCount" INTEGER NOT NULL,
  "excludedSkippedRecentCount" INTEGER NOT NULL,
  "diversityStats" JSON NOT NULL,
  "explorationUsed" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationDiagnostics_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RecommendationBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MovieEmbedding_movieId_key" ON "MovieEmbedding"("movieId");

-- CreateIndex
CREATE INDEX "UserEmbeddingSnapshot_userId_computedAt_idx" ON "UserEmbeddingSnapshot"("userId", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvidencePacket_hash_key" ON "EvidencePacket"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationDiagnostics_batchId_key" ON "RecommendationDiagnostics"("batchId");
