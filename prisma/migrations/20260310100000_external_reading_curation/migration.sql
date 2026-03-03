DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExternalReadingSourceType') THEN
    CREATE TYPE "ExternalReadingSourceType" AS ENUM ('REVIEW', 'ESSAY', 'RETROSPECTIVE');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "ExternalReadingCuration" (
  "id" TEXT NOT NULL,
  "movieId" TEXT NOT NULL,
  "seasonId" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "articleTitle" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "sourceType" "ExternalReadingSourceType" NOT NULL,
  "publicationDate" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalReadingCuration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalReadingCuration_movieId_seasonId_url_key"
  ON "ExternalReadingCuration"("movieId", "seasonId", "url");
CREATE INDEX IF NOT EXISTS "ExternalReadingCuration_seasonId_movieId_idx"
  ON "ExternalReadingCuration"("seasonId", "movieId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ExternalReadingCuration_movieId_fkey'
  ) THEN
    ALTER TABLE "ExternalReadingCuration"
      ADD CONSTRAINT "ExternalReadingCuration_movieId_fkey"
      FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ExternalReadingCuration_seasonId_fkey'
  ) THEN
    ALTER TABLE "ExternalReadingCuration"
      ADD CONSTRAINT "ExternalReadingCuration_seasonId_fkey"
      FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ExternalReadingCuration_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "ExternalReadingCuration"
      ADD CONSTRAINT "ExternalReadingCuration_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

