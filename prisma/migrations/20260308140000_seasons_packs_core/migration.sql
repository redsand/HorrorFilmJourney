-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenrePack" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "primaryGenre" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenrePack_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "JourneyProgress" ADD COLUMN "packId" TEXT;

-- AlterTable
ALTER TABLE "RecommendationBatch" ADD COLUMN "packId" TEXT;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "selectedPackId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Season_slug_key" ON "Season"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GenrePack_slug_key" ON "GenrePack"("slug");

-- CreateIndex
CREATE INDEX "JourneyProgress_packId_idx" ON "JourneyProgress"("packId");

-- CreateIndex
CREATE INDEX "RecommendationBatch_packId_idx" ON "RecommendationBatch"("packId");

-- CreateIndex
CREATE INDEX "UserProfile_selectedPackId_idx" ON "UserProfile"("selectedPackId");

-- AddForeignKey
ALTER TABLE "GenrePack" ADD CONSTRAINT "GenrePack_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_selectedPackId_fkey" FOREIGN KEY ("selectedPackId") REFERENCES "GenrePack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationBatch" ADD CONSTRAINT "RecommendationBatch_packId_fkey" FOREIGN KEY ("packId") REFERENCES "GenrePack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyProgress" ADD CONSTRAINT "JourneyProgress_packId_fkey" FOREIGN KEY ("packId") REFERENCES "GenrePack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
