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
   - Apply eligibility gate above.
2. **Reranking / diversity**
   - Deterministic heuristic balancing decade and genre diversity.
3. **Exploration policy**
   - v1 policy is no-op (no exploration).
4. **Narrative composition**
   - Deterministic template narrative validated by contract.
   - Ratings block is required in narrative.
5. **Batch persistence**
   - Stores `RecommendationBatch` + `RecommendationItem` records.
   - In modern mode, writes `RecommendationDiagnostics`.

## Recommendation payload guarantees

Each recommendation card includes:

- `movie.posterUrl` (never null)
- `ratings.imdb`
- at least one `ratings.additional` entry

## Feature flag

- `REC_ENGINE_MODE=v1` -> legacy path
- `REC_ENGINE_MODE=modern` -> composed interfaces path (currently backed by v1 adapters)
