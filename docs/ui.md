# UI Foundation

## Theme

- Background: near-black (`--bg: #050506`) with subtle top radial lift.
- Text: off-white (`--text: #f5f2f0`), muted text uses `--text-muted`.
- Accent: deep red (`--accent: #9b111e`, hover `--accent-strong: #c1121f`).
- Surfaces: elevated dark panels with subtle border and blur.

## Spacing Rules

- Mobile-first vertical rhythm: `gap-4` between major blocks.
- Safe-area support in layout:
  - top padding: `pt-[max(16px,env(safe-area-inset-top))]`
  - bottom nav padding includes `safe-area-inset-bottom`.
- Card interior spacing uses `p-4` baseline.

## Typography Rules

- Title: `text-3xl`, semibold, tight leading for high-contrast hierarchy.
- Section labels/meta: small uppercase with wide tracking.
- Body copy: `text-sm` muted for explanatory content.

## Layout Rules

- Centered mobile column with `max-w-[420px]` to mimic iPhone-width framing.
- Full-height shell uses `min-h-dvh`.
- Bottom navigation is fixed and always visible in mobile context.

## Components

- `Button`:
  - `primary`: deep red background
  - `secondary`: dark elevated with border
- `Card`:
  - rounded corners, soft shadow, subtle border, blur
- `Chip`:
  - compact pill for rating/metadata tags
- `BottomNav`:
  - fixed mobile tab bar with active state highlight

## Manual Visual Checks

1. Run `npm run dev` and open `/`.
2. Verify black background + off-white text + deep red CTA.
3. Resize to mobile width and confirm centered `max-w-[420px]` column.
4. Confirm bottom nav stays fixed and safe-area padded.
5. Verify card borders/blur are subtle and readable.
