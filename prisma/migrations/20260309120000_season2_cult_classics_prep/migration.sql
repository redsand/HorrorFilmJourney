-- Add optional season description field for authored season metadata.
ALTER TABLE "Season" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- Prepare Season 2 metadata (inactive).
INSERT INTO "Season" ("id", "slug", "name", "isActive", "createdAt", "updatedAt")
VALUES ('season_2_cult_launch', 'season-2', 'Season 2', false, NOW(), NOW())
ON CONFLICT ("slug")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "isActive" = false,
  "updatedAt" = NOW();

UPDATE "Season"
SET "description" = 'Midnight cinema, underground legends, and the films that refused to die.',
    "updatedAt" = NOW()
WHERE "slug" = 'season-2';

-- Prepare Cult Classics pack (disabled).
WITH season_two AS (
  SELECT "id" FROM "Season" WHERE "slug" = 'season-2' LIMIT 1
)
INSERT INTO "GenrePack" ("id", "slug", "name", "seasonId", "isEnabled", "primaryGenre", "description", "createdAt", "updatedAt")
SELECT 'pack_cult_classics_s2', 'cult-classics', 'Cult Classics', season_two."id", false, 'cult', 'Midnight movies, grindhouse legends, and the underground canon.', NOW(), NOW()
FROM season_two
ON CONFLICT ("slug")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "seasonId" = EXCLUDED."seasonId",
  "isEnabled" = false,
  "primaryGenre" = EXCLUDED."primaryGenre",
  "description" = EXCLUDED."description",
  "updatedAt" = NOW();

WITH cult_pack AS (
  SELECT "id" FROM "GenrePack" WHERE "slug" = 'cult-classics' LIMIT 1
)
INSERT INTO "JourneyNode" ("id", "packId", "slug", "name", "learningObjective", "whatToNotice", "eraSubgenreFocus", "spoilerPolicyDefault", "orderIndex", "createdAt", "updatedAt")
SELECT 'node_cult_foundations', cult_pack."id", 'birth-of-midnight', 'The Birth of Midnight Movies',
  'Identify the core grammar of cult cinema and why niche audiences canonize these films.',
  '["Regional filmmaking fingerprints","DIY production energy","Audience ritual moments"]'::jsonb,
  '1960s-1980s · midnight movies, outsider cinema', 'NO_SPOILERS', 1, NOW(), NOW()
FROM cult_pack
ON CONFLICT ("packId","slug")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "learningObjective" = EXCLUDED."learningObjective",
  "whatToNotice" = EXCLUDED."whatToNotice",
  "eraSubgenreFocus" = EXCLUDED."eraSubgenreFocus",
  "spoilerPolicyDefault" = EXCLUDED."spoilerPolicyDefault",
  "orderIndex" = EXCLUDED."orderIndex",
  "updatedAt" = NOW();

WITH cult_pack AS (
  SELECT "id" FROM "GenrePack" WHERE "slug" = 'cult-classics' LIMIT 1
)
INSERT INTO "JourneyNode" ("id", "packId", "slug", "name", "learningObjective", "whatToNotice", "eraSubgenreFocus", "spoilerPolicyDefault", "orderIndex", "createdAt", "updatedAt")
SELECT 'node_cult_camp_excess', cult_pack."id", 'grindhouse-exploitation', 'Grindhouse & Exploitation',
  'Low-budget rebellion and shock cinema.',
  '["Transgressive spectacle","Rough-cut aesthetic","Taboo-driven marketing"]'::jsonb,
  '1960s-1980s · grindhouse, exploitation', 'LIGHT', 2, NOW(), NOW()
FROM cult_pack
ON CONFLICT ("packId","slug")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "learningObjective" = EXCLUDED."learningObjective",
  "whatToNotice" = EXCLUDED."whatToNotice",
  "eraSubgenreFocus" = EXCLUDED."eraSubgenreFocus",
  "spoilerPolicyDefault" = EXCLUDED."spoilerPolicyDefault",
  "orderIndex" = EXCLUDED."orderIndex",
  "updatedAt" = NOW();

WITH cult_pack AS (
  SELECT "id" FROM "GenrePack" WHERE "slug" = 'cult-classics' LIMIT 1
)
INSERT INTO "JourneyNode" ("id", "packId", "slug", "name", "learningObjective", "whatToNotice", "eraSubgenreFocus", "spoilerPolicyDefault", "orderIndex", "createdAt", "updatedAt")
SELECT 'node_cult_rebel_youth', cult_pack."id", 'so-bad-its-good', 'So-Bad-It''s-Good',
  'Accidental masterpieces and ironic worship.',
  '["Unintended tonal comedy","Earnest performances vs odd craft","Audience quote culture"]'::jsonb,
  '1960s-2000s · outsider failures, ironic cult', 'NO_SPOILERS', 3, NOW(), NOW()
FROM cult_pack
ON CONFLICT ("packId","slug")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "learningObjective" = EXCLUDED."learningObjective",
  "whatToNotice" = EXCLUDED."whatToNotice",
  "eraSubgenreFocus" = EXCLUDED."eraSubgenreFocus",
  "spoilerPolicyDefault" = EXCLUDED."spoilerPolicyDefault",
  "orderIndex" = EXCLUDED."orderIndex",
  "updatedAt" = NOW();

WITH cult_pack AS (
  SELECT "id" FROM "GenrePack" WHERE "slug" = 'cult-classics' LIMIT 1
)
INSERT INTO "JourneyNode" ("id", "packId", "slug", "name", "learningObjective", "whatToNotice", "eraSubgenreFocus", "spoilerPolicyDefault", "orderIndex", "createdAt", "updatedAt")
SELECT 'node_cult_occult_nightmare', cult_pack."id", 'cult-sci-fi-fantasy', 'Cult Sci-Fi & Fantasy',
  'Visionary oddities and misunderstood epics.',
  '["Production ambition vs budget","Lore density","World-building cult hooks"]'::jsonb,
  '1970s-2000s · cult sci-fi, fantasy oddities', 'NO_SPOILERS', 4, NOW(), NOW()
FROM cult_pack
ON CONFLICT ("packId","slug")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "learningObjective" = EXCLUDED."learningObjective",
  "whatToNotice" = EXCLUDED."whatToNotice",
  "eraSubgenreFocus" = EXCLUDED."eraSubgenreFocus",
  "spoilerPolicyDefault" = EXCLUDED."spoilerPolicyDefault",
  "orderIndex" = EXCLUDED."orderIndex",
  "updatedAt" = NOW();

WITH cult_pack AS (
  SELECT "id" FROM "GenrePack" WHERE "slug" = 'cult-classics' LIMIT 1
)
INSERT INTO "JourneyNode" ("id", "packId", "slug", "name", "learningObjective", "whatToNotice", "eraSubgenreFocus", "spoilerPolicyDefault", "orderIndex", "createdAt", "updatedAt")
SELECT 'node_cult_foreign_shockwaves', cult_pack."id", 'punk-counterculture', 'Punk & Counterculture Cinema',
  'Anti-establishment film movements.',
  '["DIY ethos","Political provocation","Subculture iconography"]'::jsonb,
  '1970s-1990s · punk, counterculture, transgression', 'NO_SPOILERS', 5, NOW(), NOW()
FROM cult_pack
ON CONFLICT ("packId","slug")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "learningObjective" = EXCLUDED."learningObjective",
  "whatToNotice" = EXCLUDED."whatToNotice",
  "eraSubgenreFocus" = EXCLUDED."eraSubgenreFocus",
  "spoilerPolicyDefault" = EXCLUDED."spoilerPolicyDefault",
  "orderIndex" = EXCLUDED."orderIndex",
  "updatedAt" = NOW();

WITH cult_pack AS (
  SELECT "id" FROM "GenrePack" WHERE "slug" = 'cult-classics' LIMIT 1
)
INSERT INTO "JourneyNode" ("id", "packId", "slug", "name", "learningObjective", "whatToNotice", "eraSubgenreFocus", "spoilerPolicyDefault", "orderIndex", "createdAt", "updatedAt")
SELECT 'node_cult_midnight_rituals', cult_pack."id", 'vhs-video-store-era', 'VHS & The Video Store Era',
  'Shelf discoveries and rental legends.',
  '["Cover-art attraction","Word-of-mouth discovery","Regional rental circulation"]'::jsonb,
  '1980s-2000s · VHS cult, rental-era canon', 'NO_SPOILERS', 6, NOW(), NOW()
FROM cult_pack
ON CONFLICT ("packId","slug")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "learningObjective" = EXCLUDED."learningObjective",
  "whatToNotice" = EXCLUDED."whatToNotice",
  "eraSubgenreFocus" = EXCLUDED."eraSubgenreFocus",
  "spoilerPolicyDefault" = EXCLUDED."spoilerPolicyDefault",
  "orderIndex" = EXCLUDED."orderIndex",
  "updatedAt" = NOW();

WITH cult_pack AS (
  SELECT "id" FROM "GenrePack" WHERE "slug" = 'cult-classics' LIMIT 1
)
INSERT INTO "JourneyNode" ("id", "packId", "slug", "name", "learningObjective", "whatToNotice", "eraSubgenreFocus", "spoilerPolicyDefault", "orderIndex", "createdAt", "updatedAt")
SELECT 'node_cult_director_signatures', cult_pack."id", 'cult-comedy-absurdism', 'Cult Comedy & Absurdism',
  'Offbeat humor that found devoted fans.',
  '["Absurdist escalation","Deadpan delivery","Community in-jokes"]'::jsonb,
  '1970s-present · absurdist cult comedy', 'NO_SPOILERS', 7, NOW(), NOW()
FROM cult_pack
ON CONFLICT ("packId","slug")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "learningObjective" = EXCLUDED."learningObjective",
  "whatToNotice" = EXCLUDED."whatToNotice",
  "eraSubgenreFocus" = EXCLUDED."eraSubgenreFocus",
  "spoilerPolicyDefault" = EXCLUDED."spoilerPolicyDefault",
  "orderIndex" = EXCLUDED."orderIndex",
  "updatedAt" = NOW();

WITH cult_pack AS (
  SELECT "id" FROM "GenrePack" WHERE "slug" = 'cult-classics' LIMIT 1
)
INSERT INTO "JourneyNode" ("id", "packId", "slug", "name", "learningObjective", "whatToNotice", "eraSubgenreFocus", "spoilerPolicyDefault", "orderIndex", "createdAt", "updatedAt")
SELECT 'node_cult_legacy_revival', cult_pack."id", 'modern-cult-phenomena', 'Modern Cult Phenomena',
  'Films that became cult in the internet age.',
  '["Meme-era discovery","Community reinterpretation","Long-tail online fandom"]'::jsonb,
  '2000s-present · internet-age cult cinema', 'NO_SPOILERS', 8, NOW(), NOW()
FROM cult_pack
ON CONFLICT ("packId","slug")
DO UPDATE SET
  "name" = EXCLUDED."name",
  "learningObjective" = EXCLUDED."learningObjective",
  "whatToNotice" = EXCLUDED."whatToNotice",
  "eraSubgenreFocus" = EXCLUDED."eraSubgenreFocus",
  "spoilerPolicyDefault" = EXCLUDED."spoilerPolicyDefault",
  "orderIndex" = EXCLUDED."orderIndex",
  "updatedAt" = NOW();
