CREATE TABLE "TasteSnapshot" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "intensityPreference" DOUBLE PRECISION NOT NULL,
  "pacingPreference" DOUBLE PRECISION NOT NULL,
  "psychologicalVsSupernatural" DOUBLE PRECISION NOT NULL,
  "goreTolerance" DOUBLE PRECISION NOT NULL,
  "ambiguityTolerance" DOUBLE PRECISION NOT NULL,
  "nostalgiaBias" DOUBLE PRECISION NOT NULL,
  "auteurAffinity" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "TasteSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TasteSnapshot_userId_takenAt_idx" ON "TasteSnapshot"("userId", "takenAt");

ALTER TABLE "TasteSnapshot"
ADD CONSTRAINT "TasteSnapshot_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
