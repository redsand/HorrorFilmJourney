-- AlterTable
ALTER TABLE "NodeMovie"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "score" DOUBLE PRECISION,
ADD COLUMN "evidence" JSONB,
ADD COLUMN "runId" TEXT;

-- CreateIndex
CREATE INDEX "NodeMovie_source_idx" ON "NodeMovie"("source");

-- CreateIndex
CREATE INDEX "NodeMovie_runId_idx" ON "NodeMovie"("runId");
