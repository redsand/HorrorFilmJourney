# Season 1 Snapshot Collapse Root Cause

Generated: 2026-03-04T15:01:15.655Z
Artifacts: `C:\Users\TimShelton\source\repos\HorrorFilmJourney\artifacts\season1\snapshot-collapse\2026-03-04T15-01-11-235Z`

## Compared Releases

- Previous "good" release (found in DB): `cmmbin13f0126rgutnj649fjr`
  - runId: `season1-ontology-reassess-fixed-v1`
  - taxonomyVersion: `season-1-horror-v3.5`
  - published: no
  - unique movies: 934
  - assignments: 1337
- Current release: `cmmc5mjd000c0144c4pds3h5f`
  - runId: `season1-weak-supervision-2026-03-04T14:50:51.876Z`
  - taxonomyVersion: `season-1-horror-v3.5`
  - published: yes
  - unique movies: 294
  - assignments: 390

## What Changed

- Unique movies delta: -640
- Assignments delta: -947
- Removed movies: 650
- Added movies: 10

## Biggest Drop Driver

- Largest removal bucket: **journey_worthiness_gate (522/650)**
- The funnel now shows a hard ceiling at journey+quality stages, while the old release selected far above those counts.

## Concrete Minimal Fix

- Use a two-stage journey gate: keep strict gate for Core, but relax Extended to require eligibility + node qualityFloor only (or lower Extended journey threshold to 0.50).
- Keep Core selection strict (quality + journey + governance caps) to preserve curation quality.
- Keep Extended inclusive enough to avoid catastrophic recall collapse.

## Notes

- No published release with ~934 unique exists in the current DB; the identified ~934 snapshot is non-published and used as the best available baseline.
- Previous env flags are not persisted; config comparison includes current env plus release metadata side-by-side.
