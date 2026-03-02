-- Redefine Movie to make posterUrl required and add posterLastValidatedAt
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Movie" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tmdbId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "year" INTEGER,
  "posterUrl" TEXT NOT NULL,
  "posterLastValidatedAt" DATETIME,
  "genres" JSON,
  "director" TEXT,
  "castTop" JSON,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Movie" ("id", "tmdbId", "title", "year", "posterUrl", "genres", "director", "castTop", "createdAt", "updatedAt")
SELECT "id", "tmdbId", "title", "year", COALESCE("posterUrl", ''), "genres", "director", "castTop", "createdAt", "updatedAt" FROM "Movie";
DROP TABLE "Movie";
ALTER TABLE "new_Movie" RENAME TO "Movie";
CREATE UNIQUE INDEX "Movie_tmdbId_key" ON "Movie"("tmdbId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "MovieRating" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "movieId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "value" REAL NOT NULL,
  "scale" TEXT NOT NULL,
  "rawValue" TEXT,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MovieRating_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MovieRating_movieId_source_key" ON "MovieRating"("movieId", "source");
