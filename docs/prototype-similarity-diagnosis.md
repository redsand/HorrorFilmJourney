# Prototype Similarity Diagnosis (Season 1)

## Summary
- `prototypeSimilarityScore` was effectively `0` in the Season 1 pipeline because `MovieEmbedding` data was missing (`0 / 17,628` movies had embeddings).
- The scoring path only computes prototype similarity when `movieEmbedding` is provided.
- Season 1 prototypes also mixed:
  - numeric vectors (4D)
  - `positiveTitles` lists
  - but `positiveTitles` were not previously used in similarity scoring.

## Where Similarity Became Zero
1. In [`scoreMovieForNodes.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/nodes/scoring/scoreMovieForNodes.ts), prototype scoring only runs when `movieEmbedding` exists.
2. In [`seed-season1-horror-subgenres.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/scripts/seed-season1-horror-subgenres.ts), movies were passing DB embedding only; with no embedding rows, `movieEmbedding` stayed undefined.
3. In [`prototypeSimilarity.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/nodes/scoring/prototypeSimilarity.ts), numeric prototypes were filtered by exact dimension match; mismatches produced `prototypeScore=0`.

## Prototype Titles Resolution Audit
Checked against local `Movie.title` normalization.

- Total positive prototype titles: `132`
- Resolved to local movies: `131`
- Resolved with existing embedding before fix: `0`

| Node | Positive Titles | Resolved to Movies | Resolved w/ Embedding | Unresolved |
|---|---:|---:|---:|---:|
| supernatural-horror | 11 | 11 | 0 | 0 |
| psychological-horror | 0 | 0 | 0 | 0 |
| slasher-serial-killer | 8 | 8 | 0 | 0 |
| creature-monster | 5 | 5 | 0 | 0 |
| body-horror | 0 | 0 | 0 | 0 |
| cosmic-horror | 15 | 15 | 0 | 0 |
| folk-horror | 4 | 4 | 0 | 0 |
| sci-fi-horror | 15 | 15 | 0 | 0 |
| found-footage | 0 | 0 | 0 | 0 |
| survival-horror | 4 | 4 | 0 | 0 |
| apocalyptic-horror | 16 | 16 | 0 | 0 |
| gothic-horror | 4 | 4 | 0 | 0 |
| horror-comedy | 20 | 20 | 0 | 0 |
| splatter-extreme | 3 | 3 | 0 | 0 |
| social-domestic-horror | 6 | 6 | 0 | 0 |
| experimental-horror | 21 | 20 | 0 | 1 |

## Fix Implemented
1. Added deterministic local movie embedding module:
   - [`local-embedding.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/movie/local-embedding.ts)
   - model: `local-movie-embedding-v1`
   - dim: `4` (matches current Season 1 numeric prototype vectors)
2. Updated Season 1 build pipeline:
   - [`seed-season1-horror-subgenres.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/scripts/seed-season1-horror-subgenres.ts)
   - computes embeddings for movies missing valid embeddings
   - upserts them into `MovieEmbedding`
   - always passes `movieEmbedding` into node scoring
3. Updated prototype similarity:
   - [`prototypeSimilarity.ts`](/C:/Users/TimShelton/source/repos/HorrorFilmJourney/src/lib/nodes/scoring/prototypeSimilarity.ts)
   - now includes vectors derived from `positiveTitles` in each node centroid, so prototype title data contributes directly.

## Similarity Distribution (Post-Fix Path, deterministic local embeddings)
Sample: first 50 horror movies (250 node-score evaluations over 5 nodes)

- `prototypeUsedCount`: `250 / 250`
- `prototypeScore == 0`: `0`
- `prototypeScore > 0`: `250`
- avg: `0.609667`
- p10: `0.260953`
- p50: `0.646802`
- p90: `0.871093`
- max: `0.981701`

This confirms prototype similarity now contributes and is no longer hard-zero.
