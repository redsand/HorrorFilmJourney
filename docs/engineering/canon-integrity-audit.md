# CinemaCodex Canon Integrity Audit

**Generated:** 2026-03-04
**Status:** FAIL
**Failure Reason:** Season 2 allowlist anchors missing from snapshot

---

## Executive Summary

This audit verifies that canonical anchor films are never missing from CinemaCodex seasons.

### Summary

| Season | Anchor List | Status | Missing |
|--------|-------------|--------|---------|
| Season 1 Horror | 51 must-include anchors | PASS | 0 |
| Season 2 Cult | 3 allowlist anchors | FAIL | 3 |
| Season 2 Cult | Top 50 canon | PARTIAL | 20+ |

**AUDIT FAILED** - Season 2 canonical anchors are missing from the published snapshot.

---

## 1. Season 1 Horror Canon Anchors

All 51 must-include anchors are PRESENT in the Season 1 snapshot.

**Season 1 Anchor Status:** ALL 51 ANCHORS VERIFIED

---

## 2. Season 2 Cult Canon Anchors

### Allowlist Anchors (FAIL)

| Anchor | Year | Reason | Status |
|--------|------|--------|--------|
| The Big Lebowski | 1998 | user-required-cult-anchor | MISSING |
| Scarface | 1983 | user-required-cult-anchor | MISSING |
| Pulp Fiction | 1994 | user-required-cult-anchor | MISSING |

### Missing Major Cult Films

| Film | Year | Gap |
|------|------|-----|
| Pink Flamingos | 1972 | Foundational midnight canon |
| Eraserhead | 1977 | Core midnight surrealist |
| Videodrome | 1983 | Major body-horror pillar |
| Brazil | 1985 | Canonical dystopian sci-fi |
| Akira | 1988 | Major anime-cult crossover |
| Ghost in the Shell | 1995 | Cyberpunk cornerstone |
| Battle Royale | 2000 | Key Japanese shock title |
| Oldboy | 2003 | Korean cult phenomenon |
| The Big Lebowski | 1998 | Quote-culture anchor |
| Mulholland Drive | 2001 | Modern cult neo-noir |
| Donnie Darko | 2001 | Millennial cult sci-fi |

---

## 3. Published Release Verification

### Season 1
- Release ID: cmmc4ix3e00bbdsfs6v1r2xqh
- Unique Movies: 297
- Quality Gate: PASS

### Season 2
- Total Films: 420
- Allowlist Anchors Present: 0/3
- Top 50 Canon Present: PARTIAL

---

## 4. Audit Failures

### CRITICAL FAILURES

1. The Big Lebowski (1998) - NOT IN SNAPSHOT
2. Scarface (1983) - NOT IN SNAPSHOT
3. Pulp Fiction (1994) - NOT IN SNAPSHOT

---

## 5. Recommendations

1. Add The Big Lebowski, Scarface, Pulp Fiction to catalog
2. Re-run Season 2 snapshot
3. Implement protected anchor gate in CI/CD

---

## Data Sources

- src/config/seasons/season1-must-include.ts
- docs/season/season-2-cult-canon.json
- artifacts/season1/rebuild/2026-03-04T17-56-02Z/node-distribution.json
- artifacts/season2/season2-deterministic-snapshot.json
- artifacts/season2/season2-filmset-audit.json
