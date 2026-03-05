-- CreateTable
CREATE TABLE "EvidenceDocument" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "seasonSlug" TEXT,
    "sourceName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "license" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "embeddingModel" TEXT,
    "embeddingDim" INTEGER,
    "embeddingVector" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceDocument_sourceName_url_key" ON "EvidenceDocument"("sourceName", "url");

-- CreateIndex
CREATE INDEX "EvidenceDocument_movieId_createdAt_idx" ON "EvidenceDocument"("movieId", "createdAt");

-- CreateIndex
CREATE INDEX "EvidenceDocument_seasonSlug_createdAt_idx" ON "EvidenceDocument"("seasonSlug", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceChunk_documentId_chunkIndex_key" ON "EvidenceChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "EvidenceChunk_documentId_chunkIndex_idx" ON "EvidenceChunk"("documentId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "EvidenceDocument" ADD CONSTRAINT "EvidenceDocument_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceChunk" ADD CONSTRAINT "EvidenceChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EvidenceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

