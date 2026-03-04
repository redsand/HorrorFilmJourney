DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'JourneyNode'
  ) THEN
    ALTER TABLE "JourneyNode"
    ADD COLUMN IF NOT EXISTS "taxonomyVersion" TEXT NOT NULL DEFAULT 'legacy';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'NodeMovie'
  ) THEN
    ALTER TABLE "NodeMovie"
    ADD COLUMN IF NOT EXISTS "taxonomyVersion" TEXT NOT NULL DEFAULT 'legacy';

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'NodeMovie_taxonomyVersion_idx'
    ) THEN
      CREATE INDEX "NodeMovie_taxonomyVersion_idx" ON "NodeMovie"("taxonomyVersion");
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SeasonNodeRelease" (
  "id" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "packId" TEXT NOT NULL,
  "taxonomyVersion" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeasonNodeRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SeasonNodeReleaseItem" (
  "id" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "nodeSlug" TEXT NOT NULL,
  "movieId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "score" DOUBLE PRECISION,
  "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeasonNodeReleaseItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeasonNodeRelease_packId_taxonomyVersion_runId_key"
ON "SeasonNodeRelease"("packId", "taxonomyVersion", "runId");

CREATE INDEX IF NOT EXISTS "SeasonNodeRelease_seasonId_packId_isPublished_createdAt_idx"
ON "SeasonNodeRelease"("seasonId", "packId", "isPublished", "createdAt");

CREATE INDEX IF NOT EXISTS "SeasonNodeRelease_packId_taxonomyVersion_isPublished_createdAt_idx"
ON "SeasonNodeRelease"("packId", "taxonomyVersion", "isPublished", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "SeasonNodeReleaseItem_releaseId_nodeSlug_movieId_key"
ON "SeasonNodeReleaseItem"("releaseId", "nodeSlug", "movieId");

CREATE INDEX IF NOT EXISTS "SeasonNodeReleaseItem_releaseId_nodeSlug_rank_idx"
ON "SeasonNodeReleaseItem"("releaseId", "nodeSlug", "rank");

CREATE INDEX IF NOT EXISTS "SeasonNodeReleaseItem_movieId_idx"
ON "SeasonNodeReleaseItem"("movieId");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'Season'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SeasonNodeRelease_seasonId_fkey'
  ) THEN
    ALTER TABLE "SeasonNodeRelease"
      ADD CONSTRAINT "SeasonNodeRelease_seasonId_fkey"
      FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'GenrePack'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SeasonNodeRelease_packId_fkey'
  ) THEN
    ALTER TABLE "SeasonNodeRelease"
      ADD CONSTRAINT "SeasonNodeRelease_packId_fkey"
      FOREIGN KEY ("packId") REFERENCES "GenrePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SeasonNodeReleaseItem_releaseId_fkey'
  ) THEN
    ALTER TABLE "SeasonNodeReleaseItem"
      ADD CONSTRAINT "SeasonNodeReleaseItem_releaseId_fkey"
      FOREIGN KEY ("releaseId") REFERENCES "SeasonNodeRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SeasonNodeReleaseItem_movieId_fkey'
  ) THEN
    ALTER TABLE "SeasonNodeReleaseItem"
      ADD CONSTRAINT "SeasonNodeReleaseItem_movieId_fkey"
      FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
