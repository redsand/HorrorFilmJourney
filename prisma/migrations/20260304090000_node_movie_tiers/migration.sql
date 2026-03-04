-- CreateEnum
CREATE TYPE "NodeAssignmentTier" AS ENUM ('CORE', 'EXTENDED');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'NodeMovie'
  ) THEN
    ALTER TABLE "NodeMovie"
    ADD COLUMN IF NOT EXISTS "tier" "NodeAssignmentTier" NOT NULL DEFAULT 'CORE',
    ADD COLUMN IF NOT EXISTS "coreRank" INTEGER,
    ADD COLUMN IF NOT EXISTS "finalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "journeyScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

    UPDATE "NodeMovie"
    SET
      "coreRank" = "rank",
      "finalScore" = COALESCE("score", 0),
      "journeyScore" = 0,
      "tier" = 'CORE'
    WHERE "tier" = 'CORE' AND "coreRank" IS NULL;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'NodeMovie_nodeId_tier_rank_idx'
    ) THEN
      CREATE INDEX "NodeMovie_nodeId_tier_rank_idx" ON "NodeMovie"("nodeId", "tier", "rank");
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'NodeMovie_nodeId_tier_coreRank_idx'
    ) THEN
      CREATE INDEX "NodeMovie_nodeId_tier_coreRank_idx" ON "NodeMovie"("nodeId", "tier", "coreRank");
    END IF;
  END IF;
END $$;
