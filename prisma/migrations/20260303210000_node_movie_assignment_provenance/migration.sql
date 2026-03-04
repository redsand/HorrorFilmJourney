DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'NodeMovie'
  ) THEN
    ALTER TABLE "NodeMovie"
    ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "evidence" JSONB,
    ADD COLUMN IF NOT EXISTS "runId" TEXT;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'NodeMovie_source_idx'
    ) THEN
      CREATE INDEX "NodeMovie_source_idx" ON "NodeMovie"("source");
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'NodeMovie_runId_idx'
    ) THEN
      CREATE INDEX "NodeMovie_runId_idx" ON "NodeMovie"("runId");
    END IF;
  END IF;
END $$;
