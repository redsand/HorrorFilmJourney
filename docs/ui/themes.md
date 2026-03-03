# Dynamic Themes

CinemaCodex resolves theme and cabinet art from the active pack slug.

## How it works

- Request helper resolves active pack for current session:
  - `src/lib/packs/getActivePackForRequest.ts`
- Theme registry maps `packSlug -> ThemeConfig`:
  - `src/lib/theme/themes.ts`
- Root layout applies:
  - `data-theme` on `<html>`
  - CSS token variables on `<body>`
- `CabinetFrame` receives cabinet image path from the resolved `ThemeConfig`.

Fallback behavior:
- If session/pack cannot be resolved, theme falls back to `horror`.

## ThemeConfig shape

```ts
type ThemeConfig = {
  themeName: string;
  cabinetImagePath: string;
  marqueeLabel: string;
  tokens: Record<string, string>;
  cssVars: Record<string, string>;
  overlay?: "mist" | "neon";
  enabled: boolean;
}
```

## Core tokens

- `--cc-bg`
- `--cc-surface`
- `--cc-surface-2`
- `--cc-text`
- `--cc-text-muted`
- `--cc-border`
- `--cc-accent`
- `--cc-accent-2`
- `--cc-danger`
- `--cc-glow`
- `--cc-shadow`
- `--cc-focus`
- `--cc-link`
- `--cc-success`
- `--cc-warning`

## Pack metadata hints in `/api/packs`

Each pack now includes:
- `themeKey` (currently resolved from pack slug)
- `seasonLabel`

## Adding future packs

1. Add cabinet art to `/public/assets/cabinets/...`.
2. Add a new entry in `THEMES_BY_PACK_SLUG` in `src/lib/theme/themes.ts`.
3. Set `enabled: false` until that pack is actually launched.
4. Ensure pack slug in DB matches the map key.
5. Verify `/api/packs` returns expected `themeKey`.
6. Validate layout renders the new `data-theme` and cabinet image path.

Planned examples:
- `scifi`
- `fantasy`
- `western`
- `cult-classics` (Season 2 prep, currently disabled)

Current Season 2 cabinet asset path:
- `/assets/cabinets/cult-classics-season-2.png`

## Pack-to-theme resolution

- Request helper: `src/lib/theme/getActiveThemeForRequest.ts`
- It reads session user, resolves selected pack, then maps pack slug to theme.
- Safe fallback: if pack is missing/unknown/disabled, theme falls back to `horror`.
- Cabinet fallback: if the configured cabinet image fails to load in-browser, `CabinetFrame` falls back to `/assets/cabinets/horror-season-1.png`.

## Seasonal overlays (optional)

Seasonal overlays are lightweight visual atmosphere layers tied to `themeName`.

Current implementation:
- `horror` theme uses `HorrorMistOverlay` (`src/components/layout/HorrorMistOverlay.tsx`).
- Overlay is purely decorative (`pointer-events: none`) and does not block taps.
- Overlay is masked so it fades toward the bottom to preserve the open-bottom cabinet effect.
- Overlay is subtle and low-opacity to protect readability over card/content surfaces.

Reduced motion:
- Animations are disabled for users with reduced-motion preferences:
  - `@media (prefers-reduced-motion: reduce) { animation: none; }`

Adding overlays for future themes:
1. Add a theme-specific overlay component under `src/components/layout/`.
2. Gate rendering by `themeName` like `shouldRenderHorrorMist(...)`.
3. Keep layer opacity low and ensure `pointer-events: none`.
4. Add reduced-motion handling for all animated layers.
