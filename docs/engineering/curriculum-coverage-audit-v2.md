# Curriculum Coverage Audit v2

**Generated:** 2026-03-05
**Enriched Metadata:** tmdbId, runtime, countries, director, genres

---
## Executive Summary

This audit extends the curriculum coverage analysis with enriched metadata from the TMDB catalog.

### Coverage Overview

| Season | Nodes | Films | Core | Extended |
|--------|-------|-------|------|----------|
| Season 1 | 16 | 297 | - | - |
| Season 2 | 11 | 420 | 210 | 210 |

---
## Season 1: Horror Subgenre Curriculum

### Node Distribution Summary

- supernatural-horror: 32 films
- psychological-horror: 10 films
- slasher-serial-killer: 20 films
- creature-monster: 20 films
- body-horror: 16 films
- cosmic-horror: 8 films
- folk-horror: 13 films
- sci-fi-horror: 37 films
- found-footage: 5 films
- survival-horror: 41 films
- apocalyptic-horror: 29 films
- gothic-horror: 18 films
- horror-comedy: 25 films
- splatter-extreme: 36 films
- social-domestic-horror: 31 films
- experimental-horror: 14 films

### Quality Metrics

| Metric | Value |
|--------|-------|
| Assigned Unique Movies | 297 |
| Pass Quality Gates | 26 |
| Below Quality Gates | 27 |

### Country Distribution

- Total catalog: 22,546 films
- Horror-tagged pool: 6,894 films
- Director/Cast coverage: 99.45%

**WARNING: Season 1 - Country Concentration**

US/UK films may exceed 70% in some nodes.

### Director Distribution

No single director exceeds 25% in any node.

### Runtime Distribution

- Runtime coverage: 95.92%
- Vote count coverage: 89.76%

---
## Season 2: Cult Classics Curriculum

### Node Distribution Summary

- origins-of-cult-cinema: 38 films
- midnight-movies: 33 films
- grindhouse-exploitation: 63 films
- eurocult: 28 films
- psychotronic-cinema: 63 films
- cult-horror: 29 films
- cult-science-fiction: 80 films
- outsider-cinema: 79 films
- camp-cult-comedy: 73 films
- video-store-era: 51 films
- modern-cult-phenomena: 76 films

### Decade Distribution

| Era | Count | Core | Extended |
|-----|-------|------|----------|
| 1920s | 3 | 3 | 0 |
| 1930s | 4 | 4 | 0 |
| 1940s | 5 | 5 | 0 |
| 1950s | 17 | 16 | 1 |
| 1960s | 46 | 21 | 25 |
| 1970s | 106 | 59 | 47 |
| 1980s | 156 | 40 | 116 |
| 1990s | 110 | 21 | 89 |
| 2000s | 106 | 8 | 98 |
| 2010s | 16 | 0 | 16 |

**WARNING: Decade Imbalance**

- 1960s-1980s: 65.2% (overrepresented)
- 1990s-2000s: 9.5% (underrepresented)

### Missing Major Cult Films

| Film | Year | Gap |
|------|------|-----|
| Pink Flamingos | 1972 | Foundational midnight canon |
| Eraserhead | 1977 | Core midnight surrealist |
| Repo Man | 1984 | Essential punk-era anchor |
| Videodrome | 1983 | Major body-horror pillar |
| Brazil | 1985 | Canonical dystopian sci-fi |
| Akira | 1988 | Major anime crossover |
| Ghost in the Shell | 1995 | Cyberpunk cornerstone |
| Battle Royale | 2000 | Japanese shock title |
| Oldboy | 2003 | Korean phenomenon |
| The Big Lebowski | 1998 | Quote-culture anchor |

---
## Concentration Warnings

### Country Concentration (>70%)

**Season 1:** US/UK films likely exceed 70% in most nodes.
**Season 2:** US/UK/European films exceed 70%.

### Director Concentration (>25%)

**Season 1:** PASS - No director exceeds 25%
**Season 2:** PASS - No director exceeds 25%

---
## Recommendations

1. Add missing cult films from season2-filmset-audit.json
2. Enrich country metadata for accurate geographic analysis
3. Diversify Season 2 with more 1990s-2000s and international films

---
## Data Sources

- artifacts/season1/rebuild/2026-03-04T17-56-02Z/node-distribution.json
- artifacts/season2/season2-deterministic-snapshot.json
- artifacts/season2/season2-filmset-audit.json
- artifacts/backfills/metadata-backfill/updatedCoverage.json
- artifacts/verification/season1-catalog-verification.json
