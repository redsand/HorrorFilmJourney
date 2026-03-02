CREATE TABLE "CompanionCache" (
  "id" TEXT NOT NULL,
  "movieId" TEXT NOT NULL,
  "spoilerPolicy" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "isFullyPopulated" BOOLEAN NOT NULL DEFAULT false,
  "llmProvider" TEXT,
  "llmModel" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompanionCache_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanionCache_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CompanionCache_movieId_spoilerPolicy_key" ON "CompanionCache"("movieId", "spoilerPolicy");
CREATE INDEX "CompanionCache_expiresAt_idx" ON "CompanionCache"("expiresAt");
