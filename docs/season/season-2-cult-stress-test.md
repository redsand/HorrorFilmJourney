# Season 2 Cult Canon Stress Test

Generated: 2026-03-04T21:38:03.887Z

## Scope
- Snapshot file: `docs/season/season-2-cult-classics-mastered.json`
- Taxonomy version: `season-2-cult-v2`
- Flattened films: 613
- Summary counts: core 182, extended 431, unique 613
- Confidence coverage: 569/613 scored (44 unscored)

## Node Strength Review
| Node | Total | Core | Extended | Avg Conf | Core Avg | Borderline Ratio | Canonical Core in Top250 | Unscored | Flags |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| cult-science-fiction | 80 | 22 | 58 | 60.1 | 72.0 | 58.4% | 22 | 3 | high-borderline-ratio |
| outsider-cinema | 79 | 22 | 57 | 56.3 | 68.0 | 72.2% | 22 | 0 | low-average-confidence, high-borderline-ratio |
| modern-cult-phenomena | 76 | 22 | 54 | 54.6 | 65.0 | 75.0% | 21 | 0 | low-average-confidence, high-borderline-ratio |
| camp-cult-comedy | 73 | 22 | 51 | 55.8 | 66.0 | 68.5% | 22 | 0 | low-average-confidence, high-borderline-ratio |
| grindhouse-exploitation | 63 | 18 | 45 | 58.0 | 66.9 | 54.7% | 17 | 10 | low-average-confidence, high-borderline-ratio |
| psychotronic-cinema | 63 | 18 | 45 | 53.6 | 61.2 | 73.9% | 15 | 17 | low-average-confidence, high-borderline-ratio |
| video-store-era | 51 | 16 | 35 | 56.5 | 65.6 | 68.9% | 15 | 6 | low-average-confidence, high-borderline-ratio |
| origins-of-cult-cinema | 38 | 13 | 25 | 63.7 | 68.2 | 28.9% | 13 | 0 | decade-dominance |
| midnight-movies | 33 | 11 | 22 | 65.1 | 72.5 | 33.3% | 11 | 0 | small-node, decade-dominance |
| cult-horror | 29 | 9 | 20 | 66.3 | 81.8 | 42.9% | 9 | 8 | small-node, thin-core, decade-dominance |
| eurocult | 28 | 9 | 19 | 62.8 | 74.2 | 46.4% | 9 | 0 | small-node, thin-core, high-borderline-ratio |

Node-level flags:
- cult-science-fiction: high-borderline-ratio
- outsider-cinema: low-average-confidence, high-borderline-ratio
- modern-cult-phenomena: low-average-confidence, high-borderline-ratio
- camp-cult-comedy: low-average-confidence, high-borderline-ratio
- grindhouse-exploitation: low-average-confidence, high-borderline-ratio
- psychotronic-cinema: low-average-confidence, high-borderline-ratio
- video-store-era: low-average-confidence, high-borderline-ratio
- origins-of-cult-cinema: decade-dominance
- midnight-movies: small-node, decade-dominance
- cult-horror: small-node, thin-core, decade-dominance
- eurocult: small-node, thin-core, high-borderline-ratio

## Journey Simulation Results
### midnight-movies -> psychotronic-cinema -> outsider-cinema
- Verdict: **moderate**
- Sample avg confidence: 66.1
- Duplicate sample films across path: 0
- Segment median years: midnight-movies:1970 | psychotronic-cinema:1959 | outsider-cinema:1955
- Sample progression:
  - midnight-movies: El Topo (1970); Soldier Blue (1970); Performance (1970); The Boys in the Band (1970); The Spider's Stratagem (1970); Too Late the Hero (1970)
  - psychotronic-cinema: Reefer Madness (1936); Robot Monster (1953); The Giant Claw (1957); Plan 9 from Outer Space (1959); The Beast of Yucca Flats (1961); Santa Claus Conquers the Martians (1964)
  - outsider-cinema: D.O.A. (1949); The Prowler (1951); The Narrow Margin (1952); Blackboard Jungle (1955); The Big Combo (1955); The Phenix City Story (1955)

### grindhouse-exploitation -> eurocult -> cult-horror
- Verdict: **strong**
- Sample avg confidence: 73.2
- Duplicate sample films across path: 0
- Segment median years: grindhouse-exploitation:1968 | eurocult:1974 | cult-horror:1982
- Sample progression:
  - grindhouse-exploitation: Blood Feast (1963); Faster, Pussycat! Kill! Kill! (1965); Spider Baby (1967); The Swimmer (1968); I Drink Your Blood (1971); Last House on the Left (1972)
  - eurocult: The Devils (1971); A Bay of Blood (1971); The Wicker Man (1973); The Living Dead at Manchester Morgue (1974); The Night Porter (1974); Deep Red (1975)
  - cult-horror: The Texas Chain Saw Massacre (1974); Dawn of the Dead (1978); The Evil Dead (1981); The Thing (1982); Sleepaway Camp (1983); Re-Animator (1985)

### video-store-era -> cult-science-fiction -> modern-cult-phenomena
- Verdict: **moderate**
- Sample avg confidence: 62.4
- Duplicate sample films across path: 0
- Segment median years: video-store-era:1971 | cult-science-fiction:1971 | modern-cult-phenomena:1981
- Sample progression:
  - video-store-era: Glen or Glenda (1953); The Long Hair of Death (1964); Mudhoney (1965); Countess Dracula (1971); Shock Waves (1977); The Howling (1981)
  - cult-science-fiction: Orpheus (1950); The 7th Voyage of Sinbad (1958); Barbarella (1968); 200 Motels (1971); THX 1138 (1971); Solaris (1972)
  - modern-cult-phenomena: Gimme Shelter (1970); Grey Gardens (1975); Phantasm (1979); The Loveless (1981); House of Games (1987); Apartment Zero (1988)

## Dataset Integrity Check
- Duplicate TMDB IDs: 0
- Duplicate exact title-year pairs: 0
- Films assigned to more than one node (exact title-year): 0
- Near-duplicates (same normalized title-year ignoring leading article): 2
- Decade-dominant nodes (>=65% one decade): 3
- Country-dominant nodes (>=70% one country): 0

### Near-Duplicate Candidates (article-normalized title-year, top)
- Last House on the Left (1972) [grindhouse-exploitation/core] | The Last House on the Left (1972) [grindhouse-exploitation/extended]
- Doom Generation (1995) [outsider-cinema/extended] | The Doom Generation (1995) [outsider-cinema/extended]

### Decade Dominance Flags
- origins-of-cult-cinema: 1960s at 68.4%
- midnight-movies: 1970s at 84.8%
- cult-horror: 1980s at 69.0%

## Canonical Film Coverage
| Film | Year | Present | Node | Tier |
|---|---:|---|---|---|
| Eraserhead | 1977 | yes | midnight-movies | core |
| Pink Flamingos | 1972 | yes | midnight-movies | core |
| The Rocky Horror Picture Show | 1975 | yes | camp-cult-comedy | core |
| Suspiria | 1977 | yes | eurocult | core |
| Videodrome | 1983 | yes | cult-science-fiction | core |
| The Evil Dead | 1981 | yes | cult-horror | core |
| Phantasm | 1979 | yes | modern-cult-phenomena | core |
| Basket Case | 1982 | yes | psychotronic-cinema | core |
| Re-Animator | 1985 | yes | cult-horror | core |
| The Room | 2003 | yes | psychotronic-cinema | core |

All required canonical anchors are present.

## Publication Readiness Summary
- Structural integrity checks passed (no duplicate TMDB IDs, no exact duplicate title-year assignments, anchors present).
- Confidence scoring coverage is incomplete for current v2 snapshot; re-scoring is recommended before publish.
- 11 nodes carry quality/coherence flags; editorial review recommended for flagged nodes.
