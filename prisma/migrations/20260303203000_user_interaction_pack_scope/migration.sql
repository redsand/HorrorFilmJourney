ALTER TABLE "UserMovieInteraction"
ADD COLUMN IF NOT EXISTS "packId" TEXT;

CREATE INDEX IF NOT EXISTS "UserMovieInteraction_userId_packId_createdAt_idx"
ON "UserMovieInteraction"("userId", "packId", "createdAt");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'GenrePack'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'UserMovieInteraction_packId_fkey'
      AND table_name = 'UserMovieInteraction'
  ) THEN
    ALTER TABLE "UserMovieInteraction"
    ADD CONSTRAINT "UserMovieInteraction_packId_fkey"
    FOREIGN KEY ("packId") REFERENCES "GenrePack"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
