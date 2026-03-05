# CinemaCodex Catalog Coverage Audit

**Generated:** 2026-03-04  
**Taxonomy Versions:** Season 1 (season-1-horror-v3.5), Season 2 (season-2-cult-v3)

---

## Executive Summary

This audit analyzes the alignment between the CinemaCodex global catalog and the curated season content.

### Key Findings

| Metric | Value |
|--------|-------|
| Total Catalog Size | 22,546 films |
| Horror-Tagged Pool | 6,894 films (30.6%) |
| Season 1 Assigned Films | 297 unique films |
| Season 2 Assigned Films | 420 unique films |
| Catalog Coverage Rate | 3.2% of catalog used in seasons |

---

## 1. Films in Catalog Not Used by Any Season

### Overview

The majority of the catalog (21,829+ films) is not assigned to any season node.

### Categories of Unused Catalog Films

#### A. Non-Horror Films (15,652 films)
Films without horror genre tags are excluded from Season 1 entirely.

#### B. Horror Films Failing Journey Worthiness (6,316 films)
- Low vote count: 6,304 films
- Low rating: 6,217 films  
- Missing metadata: 1,102 films
- Runtime outliers: 926 films

#### C. Eligibility Failures (226 films)
Films missing required credits (director/cast).

#### D. Below Node Thresholds (123 films)
Films that passed journey worthiness but scored below all node thresholds.

### Recommendations

1. Create Tier 2 extended pool for high-quality films
2. Prioritize credits backfill for eligibility failures
3. Review vote count threshold for niche horror

---

## 2. Highly Rated Films Missing from All Seasons

### Analysis

The journey worthiness gate filtered out 6,316 horror films. Many have strong ratings but failed due to low vote count threshold (1500+).

### Quality Gate Results

| Gate | Result |
|------|--------|
| Runtime Coverage | 98.65% PASS |
| Vote Count Field | 96.75% PASS |
| Director/Cast Coverage | 99.45% PASS |
| Reception Presence | 100.00% PASS |

### Recommendations

1. Implement era-adjusted vote count thresholds
2. Add manual override for recognized cult classics
3. Adjust thresholds for non-English releases

---

## 3. Season Films Missing from Catalog

### Season 1 Analysis

All 297 Season 1 films are present in the catalog.

### Season 2 Missing Films (20 identified)

| Film | Year | Gap |
|------|------|-----|
| Pink Flamingos | 1972 | Foundational midnight/transgressive canon |
| Eraserhead | 1977 | Core midnight surrealist landmark |
| Repo Man | 1984 | Essential punk-era cult anchor |
| Videodrome | 1983 | Major body-horror/cult sci-fi pillar |
| Brazil | 1985 | Canonical dystopian cult sci-fi |
| Akira | 1988 | Major global anime-cult crossover |
| Ghost in the Shell | 1995 | Cyberpunk cult cornerstone |
| Battle Royale | 2000 | Key Japanese cult shock title |
| Tetsuo: The Iron Man | 1989 | Essential industrial/psychotronic |
| Audition | 1999 | Major late-90s cult horror |
| Ichi the Killer | 2001 | Canonical extreme cult transgression |
| Oldboy | 2003 | Major Korean cult phenomenon |
| This Is Spinal Tap | 1984 | Canonical cult mockumentary |
| Heathers | 1988 | Key teen dark-comedy cult touchstone |
| Clerks | 1994 | Indie/video-store-era cult staple |
| The Big Lebowski | 1998 | Quote-culture cult anchor |
| Trainspotting | 1996 | Major 90s outsider cult anchor |
| Mulholland Drive | 2001 | Canonical modern cult neo-noir |
| The Blair Witch Project | 1999 | Internet-era cult horror milestone |
| Donnie Darko | 2001 | Major millennial cult sci-fi |

### Recommendations

1. Add 20 missing major cult films to catalog
2. Create protected anchor list for canonical titles
3. Fail snapshot if >20% of protected anchors missing

---

## 4. Season Balance Analysis

### Season 2 Decade Distribution

| Era | Count | Percentage |
|-----|-------|------------|
| 1920s-1950s | 103 | 24.5% |
| 1960s-1980s | 274 | 65.2% |
| 1990s-2000s | 40 | 9.5% |

**Issue:** 1990s-2000s underrepresented despite major cult expansion.

### Recommendations

1. Target 1990s+ share at 22-30%
2. Cap pre-1960 at <=15%
3. Add global cult quota per node

---

## 5. Action Items

### High Priority

- [ ] Add 20 missing major cult films to catalog
- [ ] Implement protected anchor list
- [ ] Adjust decade distribution for Season 2

### Medium Priority

- [ ] Create Tier 2 extended pool
- [ ] Implement era-adjusted thresholds
- [ ] Add global cult quota per node

### Low Priority

- [ ] Cap franchise clustering at 2-3 titles
- [ ] Add pre-build audit gate
- [ ] Implement metadata remediation pipeline

---

## Data Sources

- artifacts/season1/rebuild/2026-03-04T17-56-02Z/node-distribution.json
- artifacts/season1/rebuild/2026-03-04T17-56-02Z/coverage-funnel.json
- artifacts/season1/rebuild/2026-03-04T17-56-02Z/quality-metrics.json
- artifacts/season2/season2-deterministic-snapshot.json
- artifacts/season2/season2-filmset-audit.json
- artifacts/verification/season1-catalog-verification.json
