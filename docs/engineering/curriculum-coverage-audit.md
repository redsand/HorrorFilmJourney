# Curriculum Coverage Audit

Generated: 2026-03-05 (America/Chicago)

## Method
- Analyzed the canonical curriculum JSON (`docs/season/season-1-horror-subgenre-curriculum.json`, `docs/season/season-2-cult-classics-curriculum.json`) and collected year metadata for every title inside each node.
- Computed decade buckets (e.g., 1980s, 2000s) per node and recorded the top decade share; the supporting script is `scripts/audit-curriculum-coverage.ts`.
- Country, director, and runtime data are not available inside those specs. Capturing those fields (e.g., TMDB metadata or catalog exports) is the next step before deriving coverage in those dimensions consistently.

## Season-level insights
- **Season 1** has 16 nodes; every node leans on post-1980 material. Six nodes (cosmic, folk, found-footage, social, experimental, body) have >50% entries from the 2010s alone, and the only decades before 1980 are much less represented. The most balanced nodes are `gothic-horror` and `splatter-extreme`, which still feature only a handful of pre-1960 films.
- **Season 2** emphasizes a narrower span: `origins-of-cult-cinema` and `video-store-era` cover mostly the 1960s-1980s, but nodes such as `modern-cult-phenomena` and `camp-cult-comedy` lean heavily into the 2000s/2010s (56% and 32% share, respectively). Only `outsider-cinema` slightly broadens the range by mixing in 1970s-1990s content.

## Nodes dominated by a single decade (dominant decade share >50%)
- Season 1: `cosmic-horror` (55% 2010s), `folk-horror` (60%), `found-footage` (60%), `survival-horror` (45% but narrow), `social-domestic-horror` (50%), `experimental-horror` (50%).
- Season 2: `video-store-era` (61% 1980s), `modern-cult-phenomena` (56% 2000s), `camp-cult-comedy` (32% but the next decades drop quickly), `origins-of-cult-cinema` (44% 1970s but still heavy mid-century). Season 2 nodes with stretched coverage are `outsider-cinema` (1990s/1980s mix) and `grindhouse-exploitation` (1980s/1970s).

## Coverage gaps and risks
- **Decades:** Contemporary horror (2010s-2020s) dominates Season 1; older decades (1940s-1960s) are underrepresented even in retro nodes. Season 2 tilts toward the VHS/2000s shelf and barely touches the 1950s or earlier.
- **Country/Director/Runtime metadata**: The curriculum specs only include title/year pairs, so we cannot assert country or director diversity. For example, no node tracks how many films are American vs. international. Without these fields, the system cannot warn when a node is 90% U.S. or 70% by a single director.
- **Subgenre drift:** Nodes like `camp-cult-comedy` currently collect mostly 2000s-2010s comedies, leaving the 1960s-1980s camp classics (e.g., `Valley of the Dolls`, `Pink Flamingos`) underrepresented.

## Suggested supplements
- **Season 1**
  1. Add more pre-1980 supernatural/psychological classics such as `The Innocents` (1961), `Don't Look Now` (1973), or earlier psych-horror from Argento/Belton to rebalance the 2010s tilt.
 2. Patch `found-footage` with proto-found-footage titles (`The Blair Witch Project` is already there but include `Cannibal Holocaust` for 1980s and `The Last Broadcast` for 1990s) to avoid 2010s dominance.
 3. Introduce international directors (e.g., Takashi Miike, Lucio Fulci) into nodes like `splatter-extreme` and `experimental` to surface diverse nationalities despite missing metadata.
- **Season 2**
  1. Seed `modern-cult-phenomena` with 1990s internet-born phenomena (`Donnie Darko`, `Run Lola Run`) to reduce the 2000s-only bias.
 2. Enrich `origins-of-cult-cinema` with more 1940s-1950s underground premieres (e.g., `The Fall of the House of Usher`, `The Night of the Hunter`) to diversify early-decade representation.
 3. Expand `camp-cult-comedy` and `psychotronic-cinema` with Eurocult/alternative directors (Merkur, Jess Franco) that bring non-American sensibilities and longer runtime variety.

## Recommendations
- **Capture richer metadata** (country, director, runtime) when a node list is published; this enables automatic audits of country/director dominance and runtime skew.
- **Weight release ships** by decade quotas (e.g., require each node to include at least two titles per major decade) to avoid 2010s drift in Season 1 or 1980s concentration in Season 2.
- **Automate alerts** for nodes where the top decade share exceeds 50% while total counts are ≥15 so editors receive a warning before publishing.
