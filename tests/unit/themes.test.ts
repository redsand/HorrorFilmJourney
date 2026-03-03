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

  it('defines cult-classics preset with cabinet mapping and neon palette', () => {
    const cultPreset = getThemePresetForPackSlug('cult-classics');
    expect(cultPreset).not.toBeNull();
    expect(cultPreset?.enabled).toBe(false);
    expect(cultPreset?.themeName).toBe('cult');
    expect(cultPreset?.cabinetImagePath).toBe('/assets/cabinets/cult-classics-season-2.png');
    expect(cultPreset?.overlay).toBe('neon');
    expect(cultPreset?.cssVars['--cc-accent']).toBe('#8f33ff');
    expect(cultPreset?.cssVars['--cc-glow']).toContain('255, 61, 173');
    expect(cultPreset?.cssVars['--cc-highlight']).toBe('#54d6ff');
  });
});
