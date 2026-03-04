-- CreateEnum
CREATE TYPE "NodeAssignmentTier" AS ENUM ('CORE', 'EXTENDED');

-- AlterTable
ALTER TABLE "NodeMovie"
ADD COLUMN "tier" "NodeAssignmentTier" NOT NULL DEFAULT 'CORE',
ADD COLUMN "coreRank" INTEGER,
ADD COLUMN "finalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "journeyScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill
UPDATE "NodeMovie"
SET
  "coreRank" = "rank",
  "finalScore" = COALESCE("score", 0),
  "journeyScore" = 0,
  "tier" = 'CORE';

-- CreateIndex
CREATE INDEX "NodeMovie_nodeId_tier_rank_idx" ON "NodeMovie"("nodeId", "tier", "rank");
CREATE INDEX "NodeMovie_nodeId_tier_coreRank_idx" ON "NodeMovie"("nodeId", "tier", "coreRank");
