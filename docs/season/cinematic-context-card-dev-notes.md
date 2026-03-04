# Cinematic Context Card Dev Notes

## Current explainability hook points

- Shared builder: `src/lib/context/build-film-context-explanation.ts`
- API access wrapper: `src/app/api/films/context/route.ts`
- Reusable UI: `src/components/context/CinematicContextCard.tsx`
- Mounted in:
  - Movie detail: `src/app/companion/[tmdbId]/page.tsx`
  - Journey node listing (compact): `src/app/journey/page.tsx`

## How to add future season explainability

1. Add season-specific machine-readable files in `docs/season` with filenames prefixed by season slug (example: `season-3-...confidence.json`).
2. Extend parsing in `build-film-context-explanation.ts`:
   - `loadSeasonIndexes` for new signal files.
   - `parsePrototypeSignal` / `parseGovernanceNotes` for new evidence shapes.
3. Keep all additions optional and signal-based:
   - never block card rendering on missing enrichment files.
   - only emit signal bullets when the signal exists.
4. Keep `whyParagraph` deterministic:
   - generate from persisted assignment + node metadata + optional scored artifacts.
