# Season 2: Cult Classics

## Scope

Season 2 is prepared as scaffolding only. It is intentionally not public:

- Season slug: `season-2`
- Season description: `Midnight cinema, underground legends, and the films that refused to die.`
- Pack slug: `cult-classics`
- Pack enabled: `false`
- Season active: `false`

## 8-Node Curriculum Arc

1. `birth-of-midnight` — **The Birth of Midnight Movies**  
   Objective: Origins of cult fandom and underground screenings.
2. `grindhouse-exploitation` — **Grindhouse & Exploitation**  
   Objective: Low-budget rebellion and shock cinema.
3. `so-bad-its-good` — **So-Bad-It's-Good**  
   Objective: Accidental masterpieces and ironic worship.
4. `cult-sci-fi-fantasy` — **Cult Sci-Fi & Fantasy**  
   Objective: Visionary oddities and misunderstood epics.
5. `punk-counterculture` — **Punk & Counterculture Cinema**  
   Objective: Anti-establishment film movements.
6. `vhs-video-store-era` — **VHS & The Video Store Era**  
   Objective: Shelf discoveries and rental legends.
7. `cult-comedy-absurdism` — **Cult Comedy & Absurdism**  
   Objective: Offbeat humor that found devoted fans.
8. `modern-cult-phenomena` — **Modern Cult Phenomena**  
   Objective: Films that became cult in the internet age.

Current status: scaffold + comprehensive curriculum source is prepared at:

- `docs/season/season-2-cult-classics-curriculum.json` (240 mapped entries, 30 per node)
- `scripts/seed-season2-cult-curriculum.ts` (resolver + eligibility-gated `NodeMovie` insert)
- `docs/season/season-2-cult-classics-readiness.md` (coverage and blockers report)

## Theme Direction

Theme key: `cult-classics`  
Theme name: `cult`  
Status: configured but disabled.

- Deep black base
- Neon purple accent
- Magenta glow
- Subtle cyan highlight
- Cabinet image placeholder: `/assets/cabinets/cult-season-2.png`
- Optional future overlay: `neon-flicker`

## Expansion Plan

1. Curate candidate title pool per node.
2. Run eligibility audit (poster, IMDb+additional ratings, reception, credits).
3. Fill each node with ranked assignments (`NodeMovie`).
4. Enable pack in admin only after readiness metrics pass.
5. Activate Season 2 only when onboarding and recommendation QA are complete.

## Enablement Checklist

- [ ] Each of the 8 nodes has curated titles assigned.
- [ ] Eligibility coverage per node meets minimum threshold.
- [ ] Companion and recommendation narratives validated for sample titles.
- [ ] `/api/packs` shows `cult-classics` only when enabled.
- [ ] Pack selection flow validated in E2E with season activation.
