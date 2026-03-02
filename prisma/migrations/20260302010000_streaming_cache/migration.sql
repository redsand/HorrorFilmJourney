-- CreateTable
CREATE TABLE "MovieStreamingCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "movieId" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "offers" JSON NOT NULL,
  "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MovieStreamingCache_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MovieStreamingCache_movieId_region_key" ON "MovieStreamingCache"("movieId", "region");

-- CreateIndex
CREATE INDEX "MovieStreamingCache_region_fetchedAt_idx" ON "MovieStreamingCache"("region", "fetchedAt");
