-- Replace the two-column unique constraint (sourceName, url) with a
-- three-column constraint (sourceName, url, seasonSlug) so that the same
-- source URL can be indexed independently per season.  This prevents the
-- cross-season contamination where ingesting Season 2 evidence would
-- overwrite Season 1 documents that share the same Wikipedia/TMDB URL.

-- Drop the old two-column unique index
DROP INDEX IF EXISTS "EvidenceDocument_sourceName_url_key";

-- Add the new three-column unique index (seasonSlug is nullable, so two
-- rows with the same sourceName+url and both seasonSlug=NULL would still
-- collide — acceptable, as null-season documents are global/unscoped).
-- Drop first in case a previous partial run left it behind.
DROP INDEX IF EXISTS "EvidenceDocument_sourceName_url_seasonSlug_key";
CREATE UNIQUE INDEX "EvidenceDocument_sourceName_url_seasonSlug_key"
  ON "EvidenceDocument" ("sourceName", "url", "seasonSlug");
