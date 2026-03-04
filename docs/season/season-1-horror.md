# Season 1: Horror Curriculum

## Theme and promise

Season 1 is a guided horror canon: users progress from foundations to contemporary forms while learning how craft, subgenre, and audience expectations evolved. The promise is intentional progression, not random picks.

## Node map (16 subgenres)

The active Season 1 taxonomy is the 16-node subgenre curriculum in:

- `docs/season/season-1-horror-subgenre-curriculum.json`

This file is the source used by `npm run seed:season1:subgenres`, admin curriculum views, and recommendation node scoping. The older 10-node curriculum is deprecated and should not be used for active Season 1 assignment.

## Curation constraints

- Each node targets 8-15 core titles.
- Titles must pass baseline eligibility:
  - poster present
  - IMDb + at least one additional rating source
  - usable reception proxies
  - credits (director + cast highlights)
- Recommendation engine behavior in Season 1:
  - pull from current node list first
  - top up from pack-level horror pool only when node inventory is exhausted

## Subgenre source of truth

- Required subgenre baseline list: `docs/season/season-1-horror-subgenre-curriculum.json`
- Seed command: `npm run seed:season1:subgenres`
- Readiness output: `docs/season/season-1-horror-subgenre-readiness.md`
