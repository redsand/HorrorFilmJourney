# Season 2 Curation Summary

Generated: 2026-03-03

## Pipeline

1. Export full candidate pool from local catalog (`review:season2:candidates`).
2. Build high-confidence shortlist (`season-2-cult-candidates-shortlist.json`).
3. Apply strict rejection policy (`curate:season2`) for:
   - mainstream franchise keywords
   - animation titles
   - future/new releases (year >= 2025)
4. Feed reject list into seed blocklist and rebuild node assignments.

## Current Counts

- Full candidate pool: `17,487`
- High-confidence shortlist: `4,456`
- Curated pool after hard rejects: `3,758`
- Rejected by policy: `696`
- Season 2 node assignments after reseed: `512` (`64 x 8`)

## Floor Gate Status

- Minimum per node gate: `>= 30`
- Current per node: `64` for all 8 nodes
- Gate result: PASS

## Key Artifacts

- Full review: `docs/season/season-2-cult-candidates-full-review.json`
- Shortlist: `docs/season/season-2-cult-candidates-shortlist.json`
- Curated: `docs/season/season-2-cult-candidates-curated.json`
- Blocklist: `docs/season/season-2-cult-classics-blocklist.json`
- Allowlist: `docs/season/season-2-cult-classics-allowlist.json`

## Commands

```bash
npm run review:season2:candidates
npm run curate:season2
npm run seed:season2:cult
npm run publish:season2
```
