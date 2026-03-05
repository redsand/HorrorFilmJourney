# Fallback Snapshot Workflow

## Purpose
- Capture season fallback pools that match the published release ordering so deterministic candidate generation can fallback to a vetted static list when runtime signals are unavailable.

## Components
1. `scripts/generate-fallback-snapshots.ts`: iterates the canonical release contracts for Season 1 and Season 2, reads CORE `NodeMovie` assignments (ordering by `node.orderIndex`, `coreRank`, `rank`), and serializes the projection of `tmdbId`s into `docs/season/<season>-fallback-candidates.json`.
2. `src/lib/recommendation/fallback-snapshot.ts`: reusable logic to compute the snapshot for a contract and normalize the output shape (`seasonSlug`, `packSlug`, `tmdbIds`).
3. `tests/unit/fallback-snapshot.test.ts`: asserts disk snapshots remain equal to the computed snapshot so any drift is detected in CI before release.

## Regeneration steps
1. Run `npx tsx scripts/generate-fallback-snapshots.ts` after updating NodeMovie assignments or re-running import/publish flows.
2. Verify the script log (`docs/season/...json (N movies)`) and commit the updated JSON files.
3. Run `npm run test -- tests/unit/fallback-snapshot.test.ts` (CI already covers this) to ensure the committed files match the computed order.

## Verification
- The generated file groups by season/pack and retains release ordering. When CI runs `tests/unit/fallback-snapshot.test.ts`, it reads both files and recomputes the snapshot for each contract; the test asserts deep equality, so missing sorting changes or new assignments will fail the build until the files are regenerated and committed.

## Automation tip
- Consider adding `scripts/generate-fallback-snapshots.ts` to the publish/deploy workflow (after `nodeMovie` seeds) so the JSON snapshots are refreshed automatically before releasing a new season catalog.
