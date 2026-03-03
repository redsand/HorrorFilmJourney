# Recommendation Engine

Recommendation generation is deterministic and user-scoped, with interface seams for modernization.

## Eligibility gate (hard requirements)

Before a movie is considered for recommendation, it must have:

1. `posterUrl` present and non-empty
2. at least 3 rating entries
3. one rating source from `IMDB`

If these constraints fail, the movie is excluded from candidates.

## Pipeline (v1 + modern adapters)

1. **Candidate generation**
   - Pull candidate IDs for user while excluding watched/already-seen and recent skipped titles.
   - Exclude recently recommended titles (`no repeats in last 10`) to reduce obvious repetition.
   - In Season 1 Horror (`SEASONS_PACKS_ENABLED=true`), run curriculum-first selection:
     - resolve current journey node from latest pack-scoped progress
     - pull node-curated titles first
     - top up from pack-level horror pool if curated inventory is insufficient
   - Apply eligibility gate above.
2. **Reranking / diversity**
   - `REC_ENGINE_MODE=modern` uses model-score reranking from user profile + interaction history.
   - Diversity is applied as a post-step constraint (light swap), not the primary rank driver.
   - `recommendationStyle` in `UserProfile.horrorDNA` controls ranking mode:
     - `diversity` (default): affinity-first ranking with light popularity influence and diversity swap.
     - `popularity`: blended popularity scoring, not TMDB-only:
       - `0.55 * TMDB trend score`
       - `0.30 * normalized ratings quality (IMDb/RT/Metacritic)`
       - `0.15 * ratings confidence (source coverage)`
3. **Exploration policy**
   - v1 policy is no-op (no exploration).
4. **Narrative composition**
   - Deterministic template narrative validated by contract.
   - Ratings block is required in narrative.
5. **Batch persistence**
   - Stores `RecommendationBatch` + `RecommendationItem` records.
   - Persists `packId` and resolved `journeyNode` on `RecommendationBatch` for traceability.
   - In modern mode, writes `RecommendationDiagnostics`, including engagement rates/trend:
     - `watchedOrSeenRate`
     - `skippedRate`
     - `positiveRateTrendLast20VsPrev20`

## Recommendation payload guarantees

Each recommendation card includes:

- `movie.posterUrl` (never null)
- `ratings.imdb`
- at least one `ratings.additional` entry

## Feature flag

- `REC_ENGINE_MODE=v1` -> legacy path
- `REC_ENGINE_MODE=modern` -> composed interfaces path (currently backed by v1 adapters)

## Proof Gates

1. Determinism gate: same user state + same dataset snapshot returns same top-5 IDs.
   - Test: `tests/prisma/recommendation-proof-gates.test.ts`
2. Personalization gate: opposing user histories must diverge and reflect preference signals.
   - Test: `tests/prisma/recommendation-proof-gates.test.ts`
3. Offline metrics gate:
   - Script: `npm run eval:recs:offline`
   - Outputs `precisionAt5`, `ndcgAt5`, `coverageAt5`, `noveltyAt5`
   - Implementation: `src/lib/recommendation/offline-eval.ts`
4. Popularity blend gate: high-trend but poor-quality titles should not outrank stronger-quality titles solely from TMDB popularity.
   - Test: `tests/prisma/recommendation-proof-gates.test.ts`
5. Curriculum-first gate: if current node has sufficient eligible curated titles, recommendations come from that node before fallback pool.
   - Test: `tests/prisma/recommendation-engine-modern.test.ts`
6. No-repeat gate: recent recommendation history excludes the last 10 recommended titles.
   - Test: `tests/prisma/recommendation-engine-modern.test.ts`
