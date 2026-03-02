-- Make posterUrl required and add posterLastValidatedAt in PostgreSQL-safe steps.
UPDATE "Movie" SET "posterUrl" = '' WHERE "posterUrl" IS NULL;
ALTER TABLE "Movie" ADD COLUMN "posterLastValidatedAt" TIMESTAMP(3);
ALTER TABLE "Movie" ALTER COLUMN "posterUrl" SET NOT NULL;

-- CreateTable
CREATE TABLE "MovieRating" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "movieId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "value" REAL NOT NULL,
  "scale" TEXT NOT NULL,
  "rawValue" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MovieRating_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MovieRating_movieId_source_key" ON "MovieRating"("movieId", "source");
