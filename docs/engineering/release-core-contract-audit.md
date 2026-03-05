# Release Core Contract Audit

## Summary
- All published `SeasonNodeReleaseItem` rows must originate from `NodeMovie` assignments that carry `tier = CORE` and the active taxonomy version for the season/pack. Any deviation renders the release invalid.
- The season metadata (`season-1/horror` → `season-1-horror-v3.5`, `season-2/cult-classics` → `season-2-cult-v3`) is now captured in `src/lib/nodes/governance/release-contract.ts` and used everywhere a release is built or published.
- Publishing now rejects: pack/season mismatches, taxonomy versions that differ from the contract, and any release items that link back to `NodeMovie` rows with `tier ≠ CORE`.

## Implementation
1. **Release contract module** (`src/lib/nodes/governance/release-contract.ts`): centralizes the canonical `(seasonSlug, packSlug, taxonomyVersion)` tuples derived from the existing governance configs and exposes `getReleaseContract`/`assertCanonicalTaxonomyVersion` helpers.
2. **Release builder** (`src/lib/nodes/governance/release-artifact.ts`):
   * fetches the genre pack/season metadata to validate the input and enforce the contract before insertion.
   * selects the `tier` field and throws if any returned assignment is not `CORE`.
   * the publish path now verifies the candidate release’s taxonomy version and runs a SQL check that joins `SeasonNodeReleaseItem → NodeMovie → JourneyNode` to detect any embedded `tier != CORE` rows before `isPublished` flips.
3. **Publish scripts** (`scripts/publish-season1-node-release.ts` and `scripts/publish-season2.ts`) now derive the taxonomy version from the contract, preventing errant overrides.
4. **Audit pipeline** (`src/lib/audit/snapshot-db-divergence.ts`) continues to compare curated snapshots to the DB, but it now also exposes `authorityCoreCount`, `releaseCoreCount`, and `coreCountDelta`, writes a release contract report (`artifacts/release-core-contract/<season>.json`), and records mismatches (`missing-in-release`/`node-drift`) there.

## Reconciliation outputs
- `artifacts/release-core-contract/<season>.json` (generated every time `enforceSnapshotGuardrail` runs):
  * `snapshotCoreCount` / `releaseCoreCount` show the total CORE assignments from the mastered snapshot and the published release.
  * `delta` is `releaseCoreCount - snapshotCoreCount`; any non-zero value represents a lost or unexpected assignment.
  * `releaseDiffs` lists the specific `DivergenceItem`s that caused the mismatch (missing-in-release + node-drift).
  * Keep this artifact alongside the unresolved report (`docs/engineering/...-unresolved.json`) for triage.

## Testing
- `npm run vitest -- run tests/unit/release-core-contract.test.ts`
  * Validates that publishing a release with an `EXTENDED` assignment fails at guard time.
  * Confirms that a repaired set of `NodeMovie` entries produces a release whose order and membership exactly mirror the NodeMovie snapshot that spawned it.
