# Journey Progression Audit

Generated: 2026-03-05 (America/Chicago)

## Methodology
- `scripts/analyze-journey-progression.ts` reads the Season 1 curriculum (`docs/season/season-1-horror-subgenre-curriculum.json`) and the Season 2 canonical mastered snapshot (`docs/season/season-2-cult-classics-mastered.json`), computes per-node median release years from every title that has a `year`, and reports detected chronological anomalies plus a suggested ordering by median year.
- This audit uses that output to evaluate whether the published journey order follows a coherent historical progression and to suggest adjustments where cinematic leaps create jarring transitions.

## Season 1: horror subgenre cairn
- Documented node order (with median release year and year range) from the curriculum stays largely grouped by modern vs classic selections; see node table produced by the script for the full list.
- **Chronological disruptions detected**:
  1. `supernatural-horror` → `psychological-horror` → `slasher-serial-killer`: medians drop from 2002 → 1999 → 1983, so the journey retreats three decades after the opening node instead of advancing.
  2. `folk-horror` → `sci-fi-horror` and later `found-footage` → `survival-horror`: each backsteps by 3–16 years.
  3. The biggest swing comes when `apocalyptic-horror` (median 2009) is followed by `gothic-horror` (1961); the sequence then jumps forward again to `horror-comedy` (1998).
- **Recommended adjustments**:
  - Promote `gothic-horror` earlier—ideally near the start—to keep the nineteenth/early twentieth-century pulse ahead of 1980s slasher/monster nodes.
  - Push `psychological-horror` and `sci-fi-horror` up into the first half of the journey (after `gothic-horror` or `creature-monster`) so that the storyline moves steadily from classic unnerving tales into modern cognitive/genre-bending work without reversing decades.
  - Group `found-footage`, `survival-horror`, `body-horror`, and `splatter-extreme` in the later half (after `cosmic-horror`), where the median years climb toward the 2000s, preserving an evolutionary arc toward contemporary aesthetics.
  - Suggested chronologically coherent order (by median year): `gothic-horror → slasher-serial-killer → creature-monster → horror-comedy → psychological-horror → sci-fi-horror → supernatural-horror → splatter-extreme → body-horror → survival-horror → apocalyptic-horror → experimental-horror → found-footage → cosmic-horror → folk-horror → social-domestic-horror`.

## Season 2: cult classics progression
- Canonical v3 nodes are already mostly chronological but three localized backsteps remain, each within a single decade:
  1. `psychotronic-cinema (1987)` → `cult-horror (1986)` → `cult-science-fiction (1985)` — a gently descending spiral that blends two mid-1980s clusters but breaks the left-to-right flow.
  2. `camp-cult-comedy (1997)` → `video-store-era (1987)` — the biggest drop (10-year) because the neon-era comedy lands after a later VHS/gore era.
- **Recommended adjustments**:
  - Swap `cult-horror` and `cult-science-fiction` so that the median climbs toward `outsider-cinema/psychotronic-cinema` before dipping again. Alternatively, reorder to `cult-science-fiction → cult-horror → outsider-cinema` to keep the median non-decreasing.
  - Place `video-store-era` before `camp-cult-comedy` so the VHS/high vaporwave material leads naturally into late-1990s underground comedies and meme-era myths.
  - Enforce a strict left-to-right ordering by median year for future nodes by using the script’s `suggested chronology-by-median order` output (`origins-of-cult-cinema → midnight-movies → grindhouse-exploitation → eurocult → cult-science-fiction → cult-horror → outsider-cinema → psychotronic-cinema → video-store-era → camp-cult-comedy → modern-cult-phenomena`) as a reference when drafting new chapters.

## Narrative guardrails
- Define an explicit chronological review step whenever a new node list is published: compute a per-node median year (using the existing script) and require the journey order to be monotonic or explain why a departure (e.g., thematic contrast) justifies a localized backstep.
- Use the script output in release notes so curators can see how the proposed order compares to the median-driven “ideal” ordering before they lock the release.
