# Season 2: Cult Classics

## Scope

Season 2 is released and active.
Verification date: 2026-03-04 (America/Chicago)

- Season slug: `season-2`
- Season description: `Midnight cinema, underground legends, and the films that refused to die.`
- Pack slug: `cult-classics`
- Pack enabled: `true`
- Season active: `true`

## 8-Node Curriculum Arc

1. `origins-of-cult-cinema` — **The Birth of Midnight Movies**  
   Objective: Origins of cult fandom and underground screenings.
2. `grindhouse-exploitation` — **Grindhouse & Exploitation**  
   Objective: Low-budget rebellion and shock cinema.
3. `psychotronic-cinema` — **So-Bad-It's-Good**  
   Objective: Accidental masterpieces and ironic worship.
4. `cult-science-fiction` — **Cult Sci-Fi & Fantasy**  
   Objective: Visionary oddities and misunderstood epics.
5. `outsider-cinema` — **Punk & Counterculture Cinema**  
   Objective: Anti-establishment film movements.
6. `video-store-era` — **VHS & The Video Store Era**  
   Objective: Shelf discoveries and rental legends.
7. `camp-cult-comedy` — **Cult Comedy & Absurdism**  
   Objective: Offbeat humor that found devoted fans.
8. `modern-cult-phenomena` — **Modern Cult Phenomena**  
   Objective: Films that became cult in the internet age.

Current status: scaffold + comprehensive curriculum source is prepared at:
Current status: released curriculum with seeded node assignments and readiness reporting:

- `docs/season/season-2-cult-classics-curriculum.json` (240 mapped entries, 30 per node)
- `scripts/seed-season2-cult-curriculum.ts` (resolver + eligibility-gated `NodeMovie` insert)
- `docs/season/season-2-cult-classics-readiness.md` (coverage and blockers report)

## Theme Direction

Theme key: `cult-classics`  
Theme name: `cult`  
Status: configured and enabled.

- Deep black base
- Neon purple accent
- Magenta glow
- Subtle cyan highlight
- Cabinet image: `/assets/cabinets/cult-classics-season-2.png`
- Optional future overlay: `neon`

## Ongoing Operations

1. Re-run curation pipeline for refreshes:
   - `npm run review:season2:candidates`
   - `npm run curate:season2`
   - `npm run seed:season2:cult`
2. Re-run controls and publish checks:
   - `npm run season2:source-votes`
   - `npm run audit:cult:controls`
3. Publish updates when needed:
   - `npm run publish:season2 -- --apply`

## Enablement Checklist

- [x] Each of the 8 nodes has curated titles assigned.
- [x] Eligibility coverage per node meets minimum threshold.
- [~] Companion and recommendation narratives validated for sample titles.
- [x] `/api/packs` shows `cult-classics` when enabled.
- [~] Pack selection flow validated in E2E with season activation.

## Notes

- Coverage/insertion evidence is tracked in:
  - `docs/season/season-2-cult-classics-readiness.md`
- Remaining items are QA validation depth, not scaffolding readiness.
