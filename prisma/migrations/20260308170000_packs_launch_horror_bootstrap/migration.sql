-- Ensure Season 1 exists and is active.
INSERT INTO "Season" ("id", "slug", "name", "isActive", "createdAt", "updatedAt")
VALUES ('season_1_launch', 'season-1', 'Season 1', true, NOW(), NOW())
ON CONFLICT ("slug")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "isActive" = true,
  "updatedAt" = NOW();

-- Keep a single active season for launch safety.
UPDATE "Season"
SET "isActive" = CASE WHEN "slug" = 'season-1' THEN true ELSE false END,
    "updatedAt" = NOW();

-- Ensure Horror pack exists and is enabled in active season.
WITH season_one AS (
  SELECT "id" FROM "Season" WHERE "slug" = 'season-1' LIMIT 1
)
INSERT INTO "GenrePack" ("id", "slug", "name", "seasonId", "isEnabled", "primaryGenre", "description", "createdAt", "updatedAt")
SELECT 'pack_horror_launch', 'horror', 'Horror', season_one."id", true, 'horror', 'Foundational horror journey pack.', NOW(), NOW()
FROM season_one
ON CONFLICT ("slug")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "seasonId" = EXCLUDED."seasonId",
  "isEnabled" = true,
  "primaryGenre" = EXCLUDED."primaryGenre",
  "description" = EXCLUDED."description",
  "updatedAt" = NOW();

-- Disable other packs for Season 1 launch.
UPDATE "GenrePack"
SET "isEnabled" = CASE WHEN "slug" = 'horror' THEN true ELSE false END,
    "updatedAt" = NOW()
WHERE "seasonId" = (SELECT "id" FROM "Season" WHERE "slug" = 'season-1');

-- Backfill existing users with Horror pack if selection is missing.
UPDATE "UserProfile"
SET "selectedPackId" = (SELECT "id" FROM "GenrePack" WHERE "slug" = 'horror'),
    "updatedAt" = NOW()
WHERE "selectedPackId" IS NULL;

-- Backfill recommendation batches to Horror when pack is missing.
UPDATE "RecommendationBatch"
SET "packId" = (SELECT "id" FROM "GenrePack" WHERE "slug" = 'horror')
WHERE "packId" IS NULL;

-- Backfill journey progress to Horror when pack is missing.
UPDATE "JourneyProgress"
SET "packId" = (SELECT "id" FROM "GenrePack" WHERE "slug" = 'horror'),
    "updatedAt" = NOW()
WHERE "packId" IS NULL;
