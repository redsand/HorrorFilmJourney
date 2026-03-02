-- Add narrative provenance columns for AI narrative caching/idempotency
ALTER TABLE "RecommendationItem"
ADD COLUMN "narrativeVersion" TEXT,
ADD COLUMN "narrativeModel" TEXT,
ADD COLUMN "narrativeHash" TEXT,
ADD COLUMN "narrativeGeneratedAt" DATETIME;

CREATE INDEX "RecommendationItem_movieId_narrativeHash_idx"
ON "RecommendationItem"("movieId", "narrativeHash");
