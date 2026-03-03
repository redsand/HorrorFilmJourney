-- CreateTable
CREATE TABLE "JourneyNode" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "learningObjective" TEXT NOT NULL,
    "whatToNotice" JSONB NOT NULL,
    "eraSubgenreFocus" TEXT NOT NULL,
    "spoilerPolicyDefault" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeMovie" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NodeMovie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JourneyNode_packId_slug_key" ON "JourneyNode"("packId", "slug");

-- CreateIndex
CREATE INDEX "JourneyNode_packId_orderIndex_idx" ON "JourneyNode"("packId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "NodeMovie_nodeId_movieId_key" ON "NodeMovie"("nodeId", "movieId");

-- CreateIndex
CREATE INDEX "NodeMovie_nodeId_rank_idx" ON "NodeMovie"("nodeId", "rank");

-- CreateIndex
CREATE INDEX "NodeMovie_movieId_idx" ON "NodeMovie"("movieId");

-- AddForeignKey
ALTER TABLE "JourneyNode" ADD CONSTRAINT "JourneyNode_packId_fkey" FOREIGN KEY ("packId") REFERENCES "GenrePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeMovie" ADD CONSTRAINT "NodeMovie_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "JourneyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeMovie" ADD CONSTRAINT "NodeMovie_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
