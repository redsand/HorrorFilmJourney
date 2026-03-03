# Theme Tokens

CinemaCodex uses CSS variable tokens for season-aware theming.  
Current default theme: `horror` (Season 1).

## Theme application

- Root attribute: `data-theme="horror"` on `<html>`.
- Provider: `src/components/theme/ThemeProvider.tsx`.
- Global token definitions: `src/app/globals.css`.

## Token table

- `--cc-bg`: app background
- `--cc-surface`: primary card/surface background
- `--cc-surface-2`: secondary elevated surface
- `--cc-text`: primary text color
- `--cc-text-muted`: secondary text color
- `--cc-border`: border/divider color
- `--cc-accent`: primary action color
- `--cc-accent-2`: hover/active accent
- `--cc-danger`: destructive/error accent
- `--cc-glow`: subtle accent glow/background wash
- `--cc-shadow`: shadow color
- `--cc-focus`: focus ring color
- `--cc-link`: link color
- `--cc-success`: success state
- `--cc-warning`: warning state

## Usage guidelines

- Use `--cc-*` tokens in UI primitives first (`Button`, `Card`, nav, badges).
- Keep contrast high for mobile readability.
- Use green mist accents sparingly (`--cc-mist` when needed).
- Avoid hardcoded palette values in feature components when token equivalents exist.

## Tailwind-friendly usage

Use arbitrary values directly with CSS vars:

- `bg-[var(--cc-bg)]`
- `text-[var(--cc-text)]`
- `border-[var(--cc-border)]`
- `ring-[var(--cc-focus)]`

## Adding future themes

Add a new selector block in `globals.css`:

- `[data-theme="scifi"] { ... }`
- `[data-theme="fantasy"] { ... }`
- `[data-theme="western"] { ... }`

Then set `data-theme` from the provider based on selected season/pack.
