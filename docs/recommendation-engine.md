# Recommendation Engine v1

RecommendationEngine v1 is a deterministic, per-user pipeline with explicit seams for future upgrades.

## Pipeline (current)

1. **Candidate generation**
   - Source: `Movie` table
2. **Filtering**
   - Exclude movies the user has `WATCHED` or `ALREADY_SEEN`
   - Exclude `SKIPPED` items from the last 30 days (configurable seam)
3. **Diversity pass**
   - Greedy scoring favors unseen decades and new genres when available
4. **Batch creation**
   - Creates one `RecommendationBatch` + up to 5 `RecommendationItem` records
5. **Narrative fill**
   - Uses deterministic safe templates validated by narrative schema

## Seams for v2+

- Candidate source can move from full table scan to retrieval/search index.
- Filter policy can add profile preferences, hard bans, and time-decay.
- Diversity strategy can be replaced with weighted optimization.
- Narrative template can switch to richer generated content while preserving schema.

## API

### POST /api/recommendations/next

Headers:

- `x-admin-token`
- `x-user-id`

Response envelope:

```json
{
  "data": {
    "batchId": "...",
    "cards": [
      { "id": "...", "rank": 1, "movie": {}, "narrative": {} }
    ]
  },
  "error": null
}
```
