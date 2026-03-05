# Slug Taxonomy Audit

Generated: 2026-03-04 (America/Chicago)

## Scope
Repository scan for node slug usage in:
- migrations
- curriculum JSON
- mastered snapshots
- ontology files
- governance configs
- RAG metadata
- recommendation/journey runtime logic

User directive for this audit: **no historical preservation required** (stealth mode cutover allowed).

## Slug Mapping Table

### Season 2 legacy family (conflicting)
| Slug | File location | Season | Usage type |
| --- | --- | --- | --- |
| `birth-of-midnight` | `prisma/migrations/20260309120000_season2_cult_classics_prep/migration.sql:38` | Season 2 | migration seed (JourneyNode bootstrap) |
| `birth-of-midnight` | `docs/season/season-2-cult-classics-curriculum.json:20` | Season 2 | curriculum spec JSON |
| `birth-of-midnight` | `src/ontology/prototypes/seasons/season-2-cult-classics.ts:8` | Season 2 | prototype pack |
| `grindhouse-exploitation` | `prisma/migrations/20260309120000_season2_cult_classics_prep/migration.sql:57` | Season 2 | migration seed |
| `grindhouse-exploitation` | `docs/season/season-2-cult-classics-curriculum.json:375` | Season 2 | curriculum spec JSON |
| `grindhouse-exploitation` | `src/ontology/prototypes/seasons/season-2-cult-classics.ts:13` | Season 2 | prototype pack |
| `so-bad-its-good` | `prisma/migrations/20260309120000_season2_cult_classics_prep/migration.sql:76` | Season 2 | migration seed |
| `so-bad-its-good` | `docs/season/season-2-cult-classics-curriculum.json:647` | Season 2 | curriculum spec JSON |
| `so-bad-its-good` | `src/ontology/prototypes/seasons/season-2-cult-classics.ts:18` | Season 2 | prototype pack |
| `cult-sci-fi-fantasy` | `prisma/migrations/20260309120000_season2_cult_classics_prep/migration.sql:95` | Season 2 | migration seed |
| `cult-sci-fi-fantasy` | `docs/season/season-2-cult-classics-curriculum.json:821` | Season 2 | curriculum spec JSON |
| `cult-sci-fi-fantasy` | `src/ontology/prototypes/seasons/season-2-cult-classics.ts:23` | Season 2 | prototype pack |
| `punk-counterculture` | `prisma/migrations/20260309120000_season2_cult_classics_prep/migration.sql:114` | Season 2 | migration seed |
| `punk-counterculture` | `docs/season/season-2-cult-classics-curriculum.json:1107` | Season 2 | curriculum spec JSON |
| `punk-counterculture` | `src/ontology/prototypes/seasons/season-2-cult-classics.ts:28` | Season 2 | prototype pack |
| `vhs-video-store-era` | `prisma/migrations/20260309120000_season2_cult_classics_prep/migration.sql:133` | Season 2 | migration seed |
| `vhs-video-store-era` | `docs/season/season-2-cult-classics-curriculum.json:1397` | Season 2 | curriculum spec JSON |
| `vhs-video-store-era` | `src/ontology/prototypes/seasons/season-2-cult-classics.ts:33` | Season 2 | prototype pack |
| `cult-comedy-absurdism` | `prisma/migrations/20260309120000_season2_cult_classics_prep/migration.sql:152` | Season 2 | migration seed |
| `cult-comedy-absurdism` | `docs/season/season-2-cult-classics-curriculum.json:1655` | Season 2 | curriculum spec JSON |
| `cult-comedy-absurdism` | `src/ontology/prototypes/seasons/season-2-cult-classics.ts:38` | Season 2 | prototype pack |
| `modern-cult-phenomena` | `prisma/migrations/20260309120000_season2_cult_classics_prep/migration.sql:171` | Season 2 | migration seed |
| `modern-cult-phenomena` | `docs/season/season-2-cult-classics-curriculum.json:1953` | Season 2 | curriculum spec JSON |
| `modern-cult-phenomena` | `src/ontology/prototypes/seasons/season-2-cult-classics.ts:43` | Season 2 | prototype pack |
| legacy family references | `docs/season/season-2-cult-classics.md:16` | Season 2 | authored MD spec |
| legacy family references | `scripts/seed-season2-cult-curriculum.ts:35` | Season 2 | seeding objective map |

### Season 2 canonical v3 family (recommended)
| Slug | File location | Season | Usage type |
| --- | --- | --- | --- |
| `origins-of-cult-cinema` | `src/ontology/seasons/season-2-cult-classics.ts:9` | Season 2 | ontology canonical |
| `origins-of-cult-cinema` | `src/config/seasons/season2-node-governance.ts:16` | Season 2 | governance config |
| `origins-of-cult-cinema` | `docs/season/season-2-cult-classics-mastered.json:11` | Season 2 | mastered snapshot |
| `midnight-movies` | `src/ontology/seasons/season-2-cult-classics.ts:17` | Season 2 | ontology canonical |
| `midnight-movies` | `src/config/seasons/season2-node-governance.ts:17` | Season 2 | governance config |
| `midnight-movies` | `docs/season/season-2-cult-classics-mastered.json:208` | Season 2 | mastered snapshot |
| `grindhouse-exploitation` | `src/ontology/seasons/season-2-cult-classics.ts:25` | Season 2 | ontology canonical |
| `grindhouse-exploitation` | `src/config/seasons/season2-node-governance.ts:18` | Season 2 | governance config |
| `grindhouse-exploitation` | `docs/season/season-2-cult-classics-mastered.json:380` | Season 2 | mastered snapshot |
| `eurocult` | `src/ontology/seasons/season-2-cult-classics.ts:33` | Season 2 | ontology canonical |
| `eurocult` | `src/config/seasons/season2-node-governance.ts:19` | Season 2 | governance config |
| `eurocult` | `docs/season/season-2-cult-classics-mastered.json:702` | Season 2 | mastered snapshot |
| `psychotronic-cinema` | `src/ontology/seasons/season-2-cult-classics.ts:41` | Season 2 | ontology canonical |
| `psychotronic-cinema` | `src/config/seasons/season2-node-governance.ts:20` | Season 2 | governance config |
| `psychotronic-cinema` | `docs/season/season-2-cult-classics-mastered.json:849` | Season 2 | mastered snapshot |
| `cult-horror` | `src/ontology/seasons/season-2-cult-classics.ts:49` | Season 2 | ontology canonical |
| `cult-horror` | `src/config/seasons/season2-node-governance.ts:21` | Season 2 | governance config |
| `cult-horror` | `docs/season/season-2-cult-classics-mastered.json:1171` | Season 2 | mastered snapshot |
| `cult-science-fiction` | `src/ontology/seasons/season-2-cult-classics.ts:57` | Season 2 | ontology canonical |
| `cult-science-fiction` | `src/config/seasons/season2-node-governance.ts:22` | Season 2 | governance config |
| `cult-science-fiction` | `docs/season/season-2-cult-classics-mastered.json:1323` | Season 2 | mastered snapshot |
| `outsider-cinema` | `src/ontology/seasons/season-2-cult-classics.ts:65` | Season 2 | ontology canonical |
| `outsider-cinema` | `src/config/seasons/season2-node-governance.ts:23` | Season 2 | governance config |
| `outsider-cinema` | `docs/season/season-2-cult-classics-mastered.json:1730` | Season 2 | mastered snapshot |
| `camp-cult-comedy` | `src/ontology/seasons/season-2-cult-classics.ts:73` | Season 2 | ontology canonical |
| `camp-cult-comedy` | `src/config/seasons/season2-node-governance.ts:24` | Season 2 | governance config |
| `camp-cult-comedy` | `docs/season/season-2-cult-classics-mastered.json:2132` | Season 2 | mastered snapshot |
| `video-store-era` | `src/ontology/seasons/season-2-cult-classics.ts:81` | Season 2 | ontology canonical |
| `video-store-era` | `src/config/seasons/season2-node-governance.ts:25` | Season 2 | governance config |
| `video-store-era` | `docs/season/season-2-cult-classics-mastered.json:2504` | Season 2 | mastered snapshot |
| `modern-cult-phenomena` | `src/ontology/seasons/season-2-cult-classics.ts:89` | Season 2 | ontology canonical |
| `modern-cult-phenomena` | `src/config/seasons/season2-node-governance.ts:26` | Season 2 | governance config |
| `modern-cult-phenomena` | `docs/season/season-2-cult-classics-mastered.json:2766` | Season 2 | mastered snapshot |
| canonical family references | `docs/season/season-2-cult-nodes.md:5` | Season 2 | authored MD spec |
| canonical family references | `docs/season/season-2-cult-publish-summary.md:31` | Season 2 | published summary MD |

### Season 2 bridge/compatibility layer
| Slug | File location | Season | Usage type |
| --- | --- | --- | --- |
| `birth-of-midnight -> origins-of-cult-cinema` | `src/lib/ontology/loadSeasonPrototypePack.ts:12` | Season 2 | compatibility alias |
| `so-bad-its-good -> psychotronic-cinema` | `src/lib/ontology/loadSeasonPrototypePack.ts:13` | Season 2 | compatibility alias |
| `cult-sci-fi-fantasy -> cult-science-fiction` | `src/lib/ontology/loadSeasonPrototypePack.ts:14` | Season 2 | compatibility alias |
| `punk-counterculture -> outsider-cinema` | `src/lib/ontology/loadSeasonPrototypePack.ts:15` | Season 2 | compatibility alias |
| `vhs-video-store-era -> video-store-era` | `src/lib/ontology/loadSeasonPrototypePack.ts:16` | Season 2 | compatibility alias |
| `cult-comedy-absurdism -> camp-cult-comedy` | `src/lib/ontology/loadSeasonPrototypePack.ts:17` | Season 2 | compatibility alias |
| alias application | `src/lib/ontology/loadSeasonPrototypePack.ts:77` | Season 2 | runtime normalization |

### Season 1 (consistent)
| Slug set | File location | Season | Usage type |
| --- | --- | --- | --- |
| 16-node Season 1 set (`supernatural-horror`…`experimental-horror`) | `src/ontology/seasons/season-1-horror-classics.ts:9` | Season 1 | ontology canonical |
| same 16-node set | `src/config/seasons/season1-node-governance.ts:20` | Season 1 | governance config |
| same 16-node set | `docs/season/season-1-horror-subgenre-curriculum.json:6` | Season 1 | curriculum spec JSON |

### RAG metadata + recommendation/journey runtime usage
| Slug | File location | Season | Usage type |
| --- | --- | --- | --- |
| canonical Season 2 node slugs in metadata | `docs/season/season-2-cult-canon.json:7` | Season 2 | RAG metadata JSON |
| canonical Season 2 node slugs in metadata | `docs/season/season-2-cult-confidence.json:310` | Season 2 | RAG metadata JSON |
| dynamic `nodeSlug` from DB/release items | `src/lib/recommendation/recommendation-engine.ts:981` | Season 1/2 | runtime recommendation logic |
| release-scoped `nodeSlug` resolution | `src/lib/recommendation/recommendation-engine.ts:913` | Season 1/2 | runtime recommendation logic |
| season artifact loader (`canon`/`confidence`) | `src/lib/journey/get-next-curriculum-steps.ts:103` | Season 2 | journey/RAG ranking logic |
| season-2 specific comparator activation | `src/lib/journey/get-next-curriculum-steps.ts:224` | Season 2 | journey/RAG ranking logic |
| fallback curriculum node slugs from docs file name convention | `src/lib/journey/get-season-journey-map.ts:40` | Season 1/2 | runtime fallback mapping |
| watch-reason loader expects docs `curriculum` + `mastered` node linkage | `src/lib/journey/watch-reason.ts:83` | Season 1/2 | runtime metadata enrichment |

## Conflicting Slug Families Detected

### Conflict A: Season 2 legacy vs canonical-v3
- Legacy family appears in migration/bootstrap + curriculum + prototype + older MD.
- Canonical-v3 appears in ontology + governance + mastered + canon/confidence + newer MD.
- This is a **hard conflict** because seed/import/runtime paths can read from both families depending on entrypoint.

### Conflict B: Docs split-brain inside Season 2
- `season-2-cult-classics-curriculum.json` and `season-2-cult-classics.md` use legacy names.
- `season-2-cult-classics-mastered.json`, `season-2-cult-nodes.md`, and RAG metadata use canonical-v3 names.

### Conflict C: Bridge still needed in runtime loader
- `loadSeasonPrototypePack` still contains alias logic from old to new families, meaning old data is still flowing in live code paths.

## Recommended Canonical Slug System
Use the **Season 2 canonical-v3 family** as the single source of truth:
- `origins-of-cult-cinema`
- `midnight-movies`
- `grindhouse-exploitation`
- `eurocult`
- `psychotronic-cinema`
- `cult-horror`
- `cult-science-fiction`
- `outsider-cinema`
- `camp-cult-comedy`
- `video-store-era`
- `modern-cult-phenomena`

Why this system:
- Already authoritative in ontology (`src/ontology/seasons/season-2-cult-classics.ts`).
- Already authoritative in governance config and mastered/RAG metadata.
- Semantically clearer and internally cohesive compared to legacy mixed naming.

## Destructive Migration Plan (Stealth-mode cutover)

### Phase 0: Freeze writes
1. Disable `seed:season2:cult`, `publish:season2`, and admin curriculum mutation endpoints during cutover window.

### Phase 1: DB reset and canonical re-seed (no history retention)
1. Delete Season 2 release data:
   - `SeasonNodeReleaseItem` for Season 2 pack releases.
   - `SeasonNodeRelease` rows for Season 2 pack.
2. Delete Season 2 node assignments:
   - `NodeMovie` rows under Season 2 pack nodes.
3. Delete Season 2 journey nodes and recreate with canonical-v3 slugs + order.
4. Re-import/reseed Season 2 from canonical docs only.

### Phase 2: Docs artifact normalization
1. Rewrite `docs/season/season-2-cult-classics-curriculum.json` slugs from legacy to canonical-v3.
2. Update `docs/season/season-2-cult-classics.md` to canonical-v3 names.
3. Keep `mastered`, `canon`, and `confidence` on canonical-v3; regenerate to ensure no stale legacy slug appears.

### Phase 3: Code normalization
1. Update `src/ontology/prototypes/seasons/season-2-cult-classics.ts` to canonical-v3 slugs and taxonomy v3.
2. Remove alias bridge in `src/lib/ontology/loadSeasonPrototypePack.ts` after docs/DB are fully cut over.
3. Update `scripts/seed-season2-cult-curriculum.ts` objective map keys to canonical-v3 slugs.

### Phase 4: RAG metadata and runtime verification
1. Regenerate `season-2-cult-canon.json` and `season-2-cult-confidence.json` from canonical DB snapshot.
2. Verify `get-next-curriculum-steps` ordering on Season 2 still resolves canonical node keys.
3. Verify recommendation pipeline returns only canonical node slugs through release items.

### Phase 5: Hard guardrails
1. Add CI check: fail if any legacy Season 2 slug appears in `prisma/`, `docs/season/`, `src/ontology/`, `src/config/seasons/`, `src/lib/journey/`, `src/lib/recommendation/`.
2. Add JSON schema validation for Season 2 curriculum/mastered/canon/confidence against canonical slug enum.

## Minimal Execution Checklist
1. One-time SQL/script to delete and recreate Season 2 nodes using canonical-v3.
2. Commit docs slug normalization.
3. Commit prototype slug normalization + alias removal.
4. Regenerate mastered/canon/confidence artifacts.
5. Run smoke tests on recommendation + journey endpoints.
