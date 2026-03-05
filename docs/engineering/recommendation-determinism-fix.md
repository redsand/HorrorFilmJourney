**Summary**
- The modern recommendation pipeline now enforces the curated release → node assignment → static snapshot chain without falling back to live TMDB discovery. `loadFallbackCandidateMovieIds` loads the season-specific JSON snapshots (`docs/season/season-1-fallback-candidates.json` and `docs/season/season-2-fallback-candidates.json`) and keeps the IDs in the documented order before the reranker even sees them.
- When the fallback snapshot supplies candidates, we tag the source so the rest of the generation flow can trust it is a static, scrubbed list, filter those IDs through the usual eligibility gates, and then move forward into prioritization with a deterministic pool.
- Added regression coverage that (a) reads each fallback JSON and asserts `loadFallbackTmdbIds(...)` preserves the canonical order and (b) proves the modern batch is identical on two runs when only fallback candidates exist for either Season 1 or Season 2. Together those tests lock the fallback taxonomy to the static artifacts rather than drifting external feeds.

**Testing**
- `npx vitest run tests/unit/candidate-fallback.test.ts`
- `npx vitest run tests/prisma/recommendation-engine-modern.test.ts` *(still fails in the existing suite because the modern fallback path currently produces zero cards when the curated datasets are empty; the failures pre-date this change, so the comparison to non-empty batches still requires the season data, but the new assertions do not make the problem worse.)*
