CREATE TABLE "JourneyProgress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "journeyNode" TEXT NOT NULL,
  "completedCount" INTEGER NOT NULL DEFAULT 0,
  "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JourneyProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JourneyProgress_userId_journeyNode_key" ON "JourneyProgress"("userId", "journeyNode");
CREATE INDEX "JourneyProgress_userId_lastUpdatedAt_idx" ON "JourneyProgress"("userId", "lastUpdatedAt");

ALTER TABLE "JourneyProgress"
ADD CONSTRAINT "JourneyProgress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
