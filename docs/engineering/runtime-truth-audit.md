# Runtime Truth Audit

Generated: 2026-03-04 (America/Chicago)

## Scope
Compared four surfaces for Season 1 + Season 2:
- Runtime registration/execution
- Docs/spec JSON + MD artifacts
- DB migrations/seeds/import state
- Build/publish/deploy scripts

## 1) Runtime Registration Surface (what actually runs)
- Ontology registry includes both seasons: `src/ontology/seasons/index.ts:5`.
- Prototype pack registry includes both seasons: `src/ontology/prototypes/seasons/index.ts:5`.
- Season 2 prototype pack is legacy v1 + old node slugs: `src/ontology/prototypes/seasons/season-2-cult-classics.ts:5`.
- Runtime prototype loader applies v1->v3 compatibility aliases only for prototype packs: `src/lib/ontology/loadSeasonPrototypePack.ts:9`, `src/lib/ontology/loadSeasonPrototypePack.ts:11`, `src/lib/ontology/loadSeasonPrototypePack.ts:68`, `src/lib/ontology/loadSeasonPrototypePack.ts:77`.
- Weak-supervision registry includes Season 2, but Season 2 plugin is empty (curation-only): `src/lib/nodes/weak-supervision/seasons/index.ts:3`, `src/lib/nodes/weak-supervision/seasons/season-2.ts:5`.
- Recommendation runtime uses published release when present, else falls back to `NodeMovie`: `src/lib/recommendation/recommendation-engine.ts:912`, `src/lib/recommendation/recommendation-engine.ts:922`, `src/lib/recommendation/recommendation-engine.ts:977`, `src/lib/recommendation/recommendation-engine.ts:986`.
- Seasons/packs feature flag is hardcoded on: `src/lib/feature-flags.ts:1`, `src/lib/feature-flags.ts:2`.

## 2) Curriculum / Spec Artifacts Found
Season 1:
- `docs/season/season-1-horror-subgenre-curriculum.json:2`
- `docs/season/season-1-node-governance.json:2`
- Key MD: `docs/season/season-1-horror.md`, `docs/season/season-1-horror-subgenre-readiness.md`

Season 2:
- Curriculum (old slug family): `docs/season/season-2-cult-classics-curriculum.json:20`, `:647`, `:821`, `:1107`, `:1397`, `:1655`, `:1953`
- Mastered snapshot (new slug family + odd season field): `docs/season/season-2-cult-classics-mastered.json:2`, `:11`, `:208`, `:702`, `:1171`, `:1323`, `:1730`, `:2132`, `:2504`
- Canon/confidence JSON keyed to new slug family (examples): `docs/season/season-2-cult-canon.json:7`, `:62`, `:106`, `:249`; `docs/season/season-2-cult-confidence.json:310`, `:1590`, `:1758`, `:3006`
- Key MD: `docs/season/season-2-cult-classics.md`, `docs/season/season-2-cult-classics-readiness.md`, `docs/season/season-2-cult-publish-summary.md`

## 3) Publish / Seed / Import Scripts Found
Season 1:
- Seed: `package.json:20` -> `scripts/seed-season1-horror-subgenres.ts`
- Export/import snapshot: `package.json:38`, `package.json:39`
- Publish: `scripts/publish-season1-node-release.ts:25`

Season 2:
- Seed: `package.json:28` -> `scripts/seed-season2-cult-curriculum.ts`
- Publish: `package.json:30` -> `scripts/publish-season2.ts`
- Export/import mastered: `package.json:35`, `package.json:37`
- Canonical export: `package.json:36` -> `scripts/export-season2-canonical.ts`
- Update pipeline: `package.json:29` -> `scripts/update-seasons.ts:7`
- Lock pipeline: `scripts/season2-lock.ts:14`-`scripts/season2-lock.ts:21`
- Remote deploy hooks can run seed/publish directly: `scripts/deploy/deploy-release.sh:41`-`scripts/deploy/deploy-release.sh:47`, `scripts/deploy/bootstrap-ubuntu24.sh:98`-`scripts/deploy/bootstrap-ubuntu24.sh:100`

## 4) Mismatch Classes

### A) Missing registration / dead code
1. `SEASONS_PACKS_ENABLED` is documented/env-configured but bypassed at runtime.
- Evidence: `.env.example:34`, `.env.production:67`, `README.md:104`, `README.md:131` vs hardcoded `return true` in `src/lib/feature-flags.ts:2`.
- Impact: cannot safely disable packs mode for rollback; operational flag is non-functional.

2. Season 2 governance config appears effectively dead for active seed/publish pipeline.
- Evidence: config defines v3 nodes (`src/config/seasons/season2-node-governance.ts:3`, `:16`-`:25`) but seed flow drives from curriculum JSON (`scripts/seed-season2-cult-curriculum.ts:830`, `:927`) and no callsites found for Season 2 governance helpers outside their module.
- Impact: changes to `season2-node-governance.ts` do not control seeded output; false sense of control.

### B) Scripts write artifacts not used (or not consumed in expected shape) at runtime
3. `export:season2:canonical` overwrites mastered file with `nodes[].titles` shape, but watch-reason runtime reads `nodes[].core/extended[].watchReason`.
- Evidence writer shape: `scripts/export-season2-canonical.ts:90`, `:96`, output path `:103`.
- Evidence reader shape: `src/lib/journey/watch-reason.ts:168`, `:169`, watchReason extraction `:177`-`:183`.
- Impact: curated watch reasons silently disappear; runtime falls back to generic reason synthesis.

4. Season 2 source-vote gate / shortlist curation writes docs artifacts not consumed by runtime.
- Evidence outputs: `scripts/season2-source-vote-gate.ts:43`-`:46`, `scripts/curate-season2-shortlist.ts:16`-`:19`.
- Runtime uses DB `NodeMovie` / `SeasonNodeReleaseItem` paths (not these files): `src/lib/recommendation/recommendation-engine.ts:938`-`:955`, `:977`-`:996`.
- Impact: operator may believe these artifacts influence production recommendations when they do not unless manually fed into seeding/import.

### C) Schema drift between mastered snapshot and importer
5. Season 2 mastered JSON carries `"season": "cult-classics"` (pack slug-like value), while importer v2 conversion ignores it and hardcodes season/pack.
- Evidence payload: `docs/season/season-2-cult-classics-mastered.json:2`.
- Evidence importer hardcode: `scripts/import-season2-mastered.ts:262`.
- Impact: schema ambiguity and silent acceptance of semantically wrong payloads.

6. Legacy mastered import path collapses all imported assignments to `CORE` tier.
- Evidence legacy branch maps `node.titles` to `tier: 'CORE'`: `scripts/import-season2-mastered.ts:292`, `:295`.
- Impact: tier semantics can be lost on import, degrading curriculum sequencing quality.

7. Static catalog backup dependency in importer is timestamp-pinned.
- Evidence: `scripts/import-season2-mastered.ts:99`.
- Impact: non-portable imports; higher unresolved/skip risk on other environments.

8. Season 2 node slug families diverge across DB migration seed vs ontology/governance/canon/mastered.
- DB prep old slugs: `prisma/migrations/20260309120000_season2_cult_classics_prep/migration.sql:38`, `:76`, `:95`, `:114`, `:133`, `:152`, `:171`.
- Ontology/governance new slugs: `src/ontology/seasons/season-2-cult-classics.ts:9`, `src/config/seasons/season2-node-governance.ts:16`-`:25`.
- Curriculum JSON old slugs: `docs/season/season-2-cult-classics-curriculum.json:20`, `:647`, `:821`, `:1107`, `:1397`, `:1655`.
- Mastered/canon/confidence new slugs: `docs/season/season-2-cult-classics-mastered.json:11`, `:208`; `docs/season/season-2-cult-canon.json:7`.
- Impact: partial node misses during seed (`Node missing in database`) and inconsistent scoring/sorting context.

### D) Environment flags that bypass correctness checks in prod
9. Balance gate for Season 2 publish defaults to off.
- Evidence: default false in config `src/config/seasons/season2-node-governance.ts:13`; publish gate reads env only `scripts/publish-season2.ts:15` and only enforces when true `scripts/publish-season2.ts:87`-`:90`.
- Impact: uneven node populations can publish without blocking.

10. Deploy hooks can seed/publish Season 2 directly from environment flags.
- Evidence: `scripts/deploy/deploy-release.sh:41`-`:47` and bootstrap analog `scripts/deploy/bootstrap-ubuntu24.sh:98`-`:100`.
- Impact: production can mutate curriculum/published release during deployment outside explicit curation approval flow.

11. Feature-flag bypass in production (`seasonsPacksEnabled()` hardcoded true) removes a rollback control.
- Evidence: `src/lib/feature-flags.ts:2`.
- Impact: inability to switch to legacy behavior during incidents.

## Impact Assessment Summary
- Breaks hard:
  - Incorrect/partial Season 2 node mapping can leave missing nodes or empty assignments for spec nodes.
  - Import portability breaks when timestamped backup file is absent.
- Silent degradation:
  - Curated watch reasons vanish after canonical export overwrite.
  - Tier semantics collapse to CORE in legacy imports.
  - Governance/config edits appear to work but do not influence seeded output.
  - Balance/quality checks can be bypassed by default env posture.

## Minimal Fixes (smallest diffs) + Where to Test
1. Re-enable real `SEASONS_PACKS_ENABLED` flag.
- Change: `src/lib/feature-flags.ts` parse env (`true/1/yes`) instead of hardcoded true.
- Tests: unit test for env parsing + integration around pack resolver (`src/lib/packs/pack-resolver.ts`).

2. Stop writing incompatible mastered shape to runtime path.
- Change: `scripts/export-season2-canonical.ts` write to a different file (e.g. `season-2-cult-canonical-export.json`) or emit `core`/`extended` sections with optional `watchReason`.
- Tests: add schema test ensuring `docs/season/season-2-cult-classics-mastered.json` is compatible with `watch-reason.ts` loader.

3. Make importer strict on v2 payload semantics.
- Change: validate `payload.season === 'season-2'` (or explicit `{season:{slug},pack:{slug}}`) and fail fast on mismatch.
- Tests: importer validation tests for wrong season value.

4. Preserve tier on legacy imports.
- Change: extend legacy format support to optional `tier` per title; default only when missing.
- Tests: roundtrip test export->import preserving CORE/EXTENDED counts.

5. Replace timestamp-pinned backup path with CLI/env input.
- Change: `scripts/import-season2-mastered.ts` accept `--catalog-backup <path>` and fallback to none.
- Tests: importer runs with/without backup file.

6. Unify Season 2 node slug source of truth.
- Change: adopt one canonical slug family (recommended: ontology v3 slugs) and migrate curriculum + DB nodes once.
- Tests: consistency test comparing slugs across ontology, governance config, curriculum/mastered docs, and DB journey nodes.

7. Make seed fail hard on missing nodes for target spec.
- Change: in `seed-season2-cult-curriculum.ts`, throw if any `specNode.slug` is missing (instead of only unresolved report).
- Tests: seed dry-run test with intentional missing node.

8. Wire Season 2 governance config into seed/publish flow or remove it.
- Change: either consume `loadSeason2NodeGovernanceConfig()` in `seed-season2-cult-curriculum.ts`/`publish-season2.ts` or delete unused config module.
- Tests: config-driven target/min values affect outputs.

9. Tighten publish guardrails in prod.
- Change: default `SEASON2_ENFORCE_BALANCE=true` for production and require explicit override to disable.
- Tests: publish script test for spread>0 when enforcement on.

10. Decouple deploy from curation mutation by default.
- Change: remove/disable automatic `seed:season2:cult`/`publish:season2 -- --apply` from deploy scripts unless explicit release flag + approval token.
- Tests: deployment script smoke test verifies no curriculum mutation on standard deploy path.

## Top 10 Fixes Ordered by Impact
1. Re-enable real `SEASONS_PACKS_ENABLED` runtime flag (`src/lib/feature-flags.ts`).
2. Prevent canonical export from overwriting runtime mastered file shape (`scripts/export-season2-canonical.ts`).
3. Enforce strict v2 mastered schema and season/pack semantics (`scripts/import-season2-mastered.ts`).
4. Preserve CORE/EXTENDED tier during imports (`scripts/import-season2-mastered.ts`).
5. Unify Season 2 node slug taxonomy across docs/DB/ontology.
6. Fail seed on missing DB nodes instead of silently continuing (`scripts/seed-season2-cult-curriculum.ts`).
7. Make Season 2 governance config authoritative or remove dead module.
8. Remove timestamp-pinned catalog backup dependency from importer.
9. Enable production balance gating by default (`SEASON2_ENFORCE_BALANCE=true`).
10. Disable automatic Season 2 seed/publish in deploy scripts by default.
