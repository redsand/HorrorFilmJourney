# Season 1 Core Underfill Diagnosis

Generated: 2026-03-04T15:28:01.271Z
Artifacts: `C:\Users\TimShelton\source\repos\HorrorFilmJourney\artifacts\season1\core-underfill\2026-03-04T15-26-19-728Z`

## Why Core Is 295 While TotalUnique Is 847

- Core requires stricter promotion constraints (journeyMinCore + coreThreshold + overlap/maxNodes + target caps).
- Extended includes many titles that remain high quality for node fit but fail strict core promotion gates.
- Current release: `cmmc6ry66016bjb2zfgi1vkdu` runId=`season1-weak-supervision-2026-03-04T15:23:03.702Z` taxonomy=`season-1-horror-v3.5`.

## Global Promotion Funnel

- Extended pool: 1085
- Pass journeyMinCore (0.60): 9
- Pass coreThreshold: 57
- Pass both: 0
- Survive constraints: 0
- Selected core from extended: 0
- Promotion pool (weak core + extended): 1183
- Promotion pool pass both: 7
- Promotion pool selected core weak: 7

## Primary Underfill Drivers

- Not enough above coreThreshold (underfilled nodes): 16
- Not enough above journeyMinCore (underfilled nodes): 16
- maxNodesPerMovie rejects: 0
- disallowed overlap rejects: 0

## Minimal Safe Fix Recommendation

- Strict-baseline core unique: 264. Current published core unique: 296.
- Recommended single change: **lower_coreThreshold_by_0.03** (delta vs strict baseline: +16).
- Safety rule applied: constraints-side changes are preferred over lowering score thresholds or journey minimum.
