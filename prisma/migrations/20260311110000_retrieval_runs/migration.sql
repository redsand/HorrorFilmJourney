-- CreateTable
CREATE TABLE "RetrievalRun" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "fallbackReason" TEXT,
    "seasonSlug" TEXT,
    "packId" TEXT,
    "queryText" TEXT,
    "candidateCount" INTEGER NOT NULL,
    "selectedCount" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetrievalRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetrievalRun_createdAt_idx" ON "RetrievalRun"("createdAt");

-- CreateIndex
CREATE INDEX "RetrievalRun_mode_createdAt_idx" ON "RetrievalRun"("mode", "createdAt");

-- CreateIndex
CREATE INDEX "RetrievalRun_movieId_createdAt_idx" ON "RetrievalRun"("movieId", "createdAt");

-- AddForeignKey
ALTER TABLE "RetrievalRun" ADD CONSTRAINT "RetrievalRun_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

