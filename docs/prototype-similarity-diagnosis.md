# Prototype Similarity Diagnosis

Generated: 2026-03-04

## Scope

Diagnose why `prototypeSimilarityScore` can appear as `0` during Season 1 node scoring and implement a deterministic fix.

## End-to-End Trace

1. Node scoring entrypoint: `src/lib/nodes/scoring/scoreMovieForNodes.ts`
2. Prototype scoring path: `src/lib/nodes/scoring/prototypeSimilarity.ts`
3. Prototype pack loader: `src/lib/ontology/loadSeasonPrototypePack.ts`
4. Season 1 pack: `src/ontology/prototypes/season-1-horror-classics.prototypes.ts`
5. Final score composition:
   - `finalScore = weakScore * 0.65 + prototypeScore * 0.35` when prototype is used

## Findings

### A) Prototype data is present and valid

- Season 1 taxonomy: `season-1-horror-v3.5`
- Prototype pack loads successfully for all 16 nodes.
- Node-level prototype titles are largely resolvable in local catalog.
  - 15/16 nodes had 100% title resolution in sampled check.
  - `experimental-horror`: 20/21 titles resolved.

### B) Embeddings exist in DB and are loadable

- `MovieEmbedding` coverage in local DB: 22546 / 22546 movies.
- Dimension: all embeddings are dim `4`.

### C) Prototype similarity distribution is non-zero when embedding is present

Sampled 500 horror movies x 16 nodes = 8000 node scores:

- `prototypeScore` min/p50/p90/max: `0.003509 / 0.521038 / 0.826767 / 0.997892`
- zero scores: `0 / 8000`

So the prototype scorer itself is functioning.

### D) Root cause of zero contribution

`scoreMovieForNodes` previously only invoked prototype scoring when `movieEmbedding` was explicitly provided:

- If a caller omitted embedding or passed an invalid/empty vector, prototype scoring was skipped.
- In that case `prototypeScore` defaulted to `0`, so prototype contribution was effectively dropped.

This created a failure mode at call sites that did not hydrate embeddings consistently.

## Fix Implemented

Updated `src/lib/nodes/scoring/scoreMovieForNodes.ts`:

- Added deterministic embedding resolution:
  - Use provided embedding if valid.
  - Otherwise derive local embedding from movie text (`title/year/synopsis/genres/keywords`) via `computeLocalMovieEmbedding`.
- Prototype scoring now always runs with a valid embedding vector.

This removes the all-zero path caused by missing embeddings at the caller level without changing scoring weights.

## Deterministic Tests

Updated `tests/unit/prototype-similarity.test.ts`:

1. `prototype title returns similarity > 0` (existing)
2. `similar films increase node score` (existing)
3. `derives embedding when movieEmbedding is missing` (new)
   - Ensures prototype score still contributes and is non-zero for a prototype-like movie.

All related tests pass.
