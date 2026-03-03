import { describe, expect, it } from 'vitest';
import { getThemeConfigForPackSlug, getThemePresetForPackSlug } from '@/lib/theme/themes';

describe('theme config mapping', () => {
  it('returns horror mapping for horror pack', () => {
    const config = getThemeConfigForPackSlug('horror');
    expect(config.themeName).toBe('horror');
    expect(config.cabinetImagePath).toBe('/assets/cabinets/horror-season-1.png');
    expect(config.cssVars['--cc-bg']).toBeDefined();
  });

  it('falls back to horror for unknown pack', () => {
    const config = getThemeConfigForPackSlug('unknown-pack');
    expect(config.themeName).toBe('horror');
  });

  it('keeps placeholder presets disabled and falls back to horror', () => {
    const scifiPreset = getThemePresetForPackSlug('scifi');
    expect(scifiPreset).not.toBeNull();
    expect(scifiPreset?.enabled).toBe(false);

    const resolved = getThemeConfigForPackSlug('scifi');
    expect(resolved.themeName).toBe('horror');
  });
});
