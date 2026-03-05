# Recommendation Determinism Audit

Generated: 2026-03-05 (America/Chicago)

## Experiment setup
- The audit script `scripts/audit-recommendation-determinism.ts` seeds two test packs (Season 1 “horror” and Season 2 “cult-classics”) with curated releases and runs `generateRecommendationBatch` 10 times per pack under `REC_ENGINE_MODE=modern`. Each run logs the ordered list of `tmdbId:rank` pairs so we can compare candidate orderings and reranking results.

## Variance findings
- Season 1 batches produced three unique `tmdbId:rank` sequences even though all inputs (DB state, user profile, `targetCount`) were identical; the reranker output tracked through `batch.cards` reordered whenever the upstream fallback pool shifted.
- Season 2 batches were always empty because the pack lacked curated data—this deterministic emptiness shows the fallbacks cannot accidentally include extra titles when the curated catalog is missing.
- The variation coincides with each run’s `tmdb.sync` call (the script log shows repeated `[tmdb.sync] skipped` entries followed by new candidate sets), so the instability is upstream of the reranker itself.

## Non-deterministic sources
- `syncTmdbHorrorCandidates` fetches live TMDB discover pages on every recommendation request, so the generated fallback candidate set drifts with the external data and leads to different ordering as soon as the curated release path is unavailable.
- The fallback path still filters by genre and eligibility, but the query uses a `Set`/`Array` combination that preserves insertion order. The core nondeterminism stems from the upstream fetch rather than SQL ordering.
- Reranking/diagnostics (`HeuristicRerankerV1`, `prioritizeCoreThenExtended`) are deterministic when inputs are equal, so their variation correlates directly with the changing candidate pool seeded by TMDB.

## Recommendations
- **Publish every release before relying on recommendations.** `seasonNodeReleaseItem` rows are static, deterministic, and preferred by `SqlCandidateGeneratorV1`, so when `hasPackCatalog` is true, the fallback path never runs and recommendations remain stable.
- **Determinize the fallback candidate pool.** When a release isn’t available, cache a fixed candidate list per season (e.g., from the last successful TMDB sync or an approved dataset) and refuse to refresh it mid-batch. Alternatively, skip fetching new pages when `SEASONS_PACKS_ENABLED` is true and releases are expected.
- **Monitor fallback activations.** Add analytics/alerts when `curatedIds.length < targetCount` or `fallbackCount > 0` so operations can reseed releases before the nondeterministic path affects consumers.

## Evidence
- Script output shows Season 1 variation (3 unique sequences) versus Season 2 empty batches; run command: `npx tsx scripts/audit-recommendation-determinism.ts`.  
- Existing tests `npm run test -- tests/prisma/recommendation-engine-modern.test.ts` confirm deterministic behavior when curated data is present.
