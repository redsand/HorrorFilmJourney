-- Season 2 destructive slug cutover (stealth mode)
-- WARNING: This wipes Season 2 release, assignment, node, and progress data.
-- Run with: psql "$DATABASE_URL" -f scripts/season2-destructive-cutover.sql

BEGIN;

WITH season_two AS (
  SELECT "id"
  FROM "Season"
  WHERE "slug" = 'season-2'
  LIMIT 1
)
INSERT INTO "Season" ("id", "slug", "name", "description", "isActive", "createdAt", "updatedAt")
SELECT 'season_2_cult_launch', 'season-2', 'Season 2', 'Midnight cinema, underground legends, and the films that refused to die.', false, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM season_two);

WITH season_two AS (
  SELECT "id"
  FROM "Season"
  WHERE "slug" = 'season-2'
  LIMIT 1
)
INSERT INTO "GenrePack" ("id", "slug", "name", "seasonId", "isEnabled", "primaryGenre", "description", "createdAt", "updatedAt")
SELECT 'pack_cult_classics_s2', 'cult-classics', 'Cult Classics', season_two."id", false, 'cult', 'Midnight movies, grindhouse legends, and the underground canon.', NOW(), NOW()
FROM season_two
ON CONFLICT ("slug") DO UPDATE SET
  "seasonId" = EXCLUDED."seasonId",
  "name" = EXCLUDED."name",
  "isEnabled" = EXCLUDED."isEnabled",
  "primaryGenre" = EXCLUDED."primaryGenre",
  "description" = EXCLUDED."description",
  "updatedAt" = NOW();

-- Wipe all published releases for Season 2 pack.
DELETE FROM "SeasonNodeReleaseItem"
WHERE "releaseId" IN (
  SELECT r."id"
  FROM "SeasonNodeRelease" r
  JOIN "GenrePack" p ON p."id" = r."packId"
  WHERE p."slug" = 'cult-classics'
);

DELETE FROM "SeasonNodeRelease"
WHERE "packId" IN (
  SELECT "id" FROM "GenrePack" WHERE "slug" = 'cult-classics'
);

-- Wipe all node assignments and journey progress for the pack.
DELETE FROM "NodeMovie"
WHERE "nodeId" IN (
  SELECT n."id"
  FROM "JourneyNode" n
  JOIN "GenrePack" p ON p."id" = n."packId"
  WHERE p."slug" = 'cult-classics'
);

DELETE FROM "JourneyProgress"
WHERE "packId" IN (
  SELECT "id" FROM "GenrePack" WHERE "slug" = 'cult-classics'
);

-- Wipe and recreate canonical-v3 Season 2 nodes.
DELETE FROM "JourneyNode"
WHERE "packId" IN (
  SELECT "id" FROM "GenrePack" WHERE "slug" = 'cult-classics'
);

WITH cult_pack AS (
  SELECT "id" FROM "GenrePack" WHERE "slug" = 'cult-classics' LIMIT 1
), canonical_nodes AS (
  SELECT *
  FROM (VALUES
    ('node_cult_origins', 'origins-of-cult-cinema', 'Origins of Cult Cinema', 'Foundations of cult reputation before codified midnight and VHS cultures.', '["Proto-cult rediscovery","Forbidden cinema circuits","Critical reevaluation"]'::jsonb, '1920s-1970s · proto-cult foundations', 'NO_SPOILERS', 1),
    ('node_cult_midnight_movies', 'midnight-movies', 'Midnight Movies', 'Counterculture theatrical circuit driven by repeat late-night screenings.', '["Late-night ritual viewing","Audience participation","Counterculture circulation"]'::jsonb, '1970s-1990s · theatrical midnight circuit', 'NO_SPOILERS', 2),
    ('node_cult_grindhouse', 'grindhouse-exploitation', 'Grindhouse & Exploitation', 'Low-budget transgressive cinema tied to grindhouse, regional, and import circuits.', '["Transgressive spectacle","Rough-cut aesthetic","Taboo-driven marketing"]'::jsonb, '1960s-1980s · grindhouse and exploitation', 'LIGHT', 3),
    ('node_cult_eurocult', 'eurocult', 'Eurocult', 'European cult traditions across giallo-adjacent, transgressive art-horror, and exploitation hybrids.', '["Continental transgression","Arthouse-exploitation overlap","Festival rediscovery"]'::jsonb, '1960s-1990s · eurocult and art-horror', 'NO_SPOILERS', 4),
    ('node_cult_psychotronic', 'psychotronic-cinema', 'Psychotronic Cinema', 'Wild and disreputable oddities canonized through fan communities.', '["Outsider craft","Trash aesthetics","Video-era rediscovery"]'::jsonb, '1970s-2000s · psychotronic and trash', 'NO_SPOILERS', 5),
    ('node_cult_horror', 'cult-horror', 'Cult Horror', 'Cult horror canon shaped by fandom, repertory revival, and home-video circulation.', '["Horror fandom","Practical effects fixation","Ritual rewatching"]'::jsonb, '1970s-2000s · cult horror canon', 'LIGHT', 6),
    ('node_cult_scifi', 'cult-science-fiction', 'Cult Science Fiction', 'Speculative cult canon shaped by midnight and genre fan circuits.', '["Speculative mythology","Retro-futurist aesthetics","Genre fandom canon"]'::jsonb, '1970s-2000s · cult science fiction', 'NO_SPOILERS', 7),
    ('node_cult_outsider', 'outsider-cinema', 'Outsider Cinema', 'Counter-institutional films rooted in outsider authorship and subcultural circulation.', '["DIY ethos","Subculture iconography","Counter-institutional tone"]'::jsonb, '1970s-2000s · outsider and counterculture', 'NO_SPOILERS', 8),
    ('node_cult_camp_comedy', 'camp-cult-comedy', 'Camp & Cult Comedy', 'Camp and absurdist comedies canonized by repeat-viewing communities.', '["Absurdist escalation","Quote culture","Community in-jokes"]'::jsonb, '1970s-present · camp and cult comedy', 'NO_SPOILERS', 9),
    ('node_cult_video_store', 'video-store-era', 'Video Store Era', 'VHS rental culture that created shelf-discovery cult canon.', '["Cover-art attraction","Word-of-mouth discovery","Rental circulation"]'::jsonb, '1980s-2000s · VHS and rental-era cult', 'NO_SPOILERS', 10),
    ('node_cult_modern', 'modern-cult-phenomena', 'Modern Cult Phenomena', 'Cult formations accelerated by online fandom and rediscovery.', '["Meme-era discovery","Community reinterpretation","Long-tail fandom"]'::jsonb, '1990s-2010s · internet-age cult formation', 'NO_SPOILERS', 11)
  ) AS v(id, slug, name, learning_objective, what_to_notice, era_subgenre_focus, spoiler_policy_default, order_index)
)
INSERT INTO "JourneyNode" (
  "id", "packId", "slug", "name", "taxonomyVersion", "learningObjective", "whatToNotice", "eraSubgenreFocus", "spoilerPolicyDefault", "orderIndex", "createdAt", "updatedAt"
)
SELECT
  canonical_nodes.id,
  cult_pack."id",
  canonical_nodes.slug,
  canonical_nodes.name,
  'season-2-cult-v3',
  canonical_nodes.learning_objective,
  canonical_nodes.what_to_notice,
  canonical_nodes.era_subgenre_focus,
  canonical_nodes.spoiler_policy_default,
  canonical_nodes.order_index,
  NOW(),
  NOW()
FROM canonical_nodes, cult_pack;

COMMIT;
