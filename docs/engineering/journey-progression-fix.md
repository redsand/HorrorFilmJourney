# Journey Progression Fix

**Generated:** 2026-03-05
**Status:** RESOLVED

---

## Executive Summary

This fix reorders Season 1 and Season 2 nodes to follow a historically coherent progression.

### Results

| Season | Before | After | Improvement |
|--------|--------|-------|-------------|
| Season 1 | 8 anomalies | 1 leap | 87.5% reduction |
| Season 2 | 3 anomalies | 0 anomalies | 100% resolution |

---

## Season 1 Changes

### New Order (Historical Progression)

1. gothic-horror (1961) - Classic Gothic era
2. slasher-serial-killer (1983) - 1980s slasher boom
3. creature-monster (1989) - Creature features
4. horror-comedy (1998) - Genre blending
5. psychological-horror (1999) - Mind-bending dread
6. sci-fi-horror (1999.5) - Tech horror
7. supernatural-horror (2002) - Paranormal surge
8. splatter-extreme (2007) - Transgressive horror
9. body-horror (2008.5) - Physical terror
10. survival-horror (2008.5) - Endurance narratives
11. apocalyptic-horror (2009) - Collapse scenarios
12. experimental-horror (2011.5) - Avant-garde
13. found-footage (2012) - Digital age horror
14. cosmic-horror (2013) - Existential dread
15. folk-horror (2015.5) - Rural rituals
16. social-domestic-horror (2016) - Modern social commentary

---

## Season 2 Changes

### New Order (Cult Cinema Evolution)

1. origins-of-cult-cinema (1962) - Proto-cult
2. midnight-movies (1974) - Counterculture
3. grindhouse-exploitation (1979) - Exploitation
4. eurocult (1981) - European traditions
5. cult-science-fiction (1985) - Speculative
6. cult-horror (1986) - Horror fandom
7. outsider-cinema (1986) - DIY rebellion
8. psychotronic-cinema (1987) - Disreputable oddities
9. video-store-era (1987) - VHS culture
10. camp-cult-comedy (1997) - Quote culture
11. modern-cult-phenomena (2003) - Internet era

---

## Files Modified

- src/ontology/seasons/season-1-horror-classics.ts
- src/ontology/seasons/season-2-cult-classics.ts
- docs/season/season-1-horror-subgenre-curriculum.json
- docs/season/season-2-cult-classics-mastered.json

---

## Verification

Run: npx tsx scripts/analyze-journey-progression.ts

Expected: Season 1 - 1 leap (acceptable), Season 2 - 0 anomalies
