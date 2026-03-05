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

  it('resolves season 3 sci-fi theme for sci-fi pack slug', () => {
    const scifiPreset = getThemePresetForPackSlug('sci-fi');
    expect(scifiPreset).not.toBeNull();
    expect(scifiPreset?.enabled).toBe(true);
    expect(scifiPreset?.themeName).toBe('scifi');
    expect(scifiPreset?.cabinetImagePath).toBe('/assets/cabinets/sci-fi-season-3.png');
    expect(scifiPreset?.cssVars['--cc-accent']).toBe('#21b6ff');

    const resolved = getThemeConfigForPackSlug('sci-fi');
    expect(resolved.themeName).toBe('scifi');
    expect(resolved.cabinetImagePath).toBe('/assets/cabinets/sci-fi-season-3.png');
  });

  it('keeps scifi alias mapped to season 3 for backward compatibility', () => {
    const resolved = getThemeConfigForPackSlug('scifi');
    expect(resolved.themeName).toBe('scifi');
    expect(resolved.cabinetImagePath).toBe('/assets/cabinets/sci-fi-season-3.png');
  });

  it('defines cult-classics preset with cabinet mapping and neon palette', () => {
    const cultPreset = getThemePresetForPackSlug('cult-classics');
    expect(cultPreset).not.toBeNull();
    expect(cultPreset?.enabled).toBe(true);
    expect(cultPreset?.themeName).toBe('cult');
    expect(cultPreset?.cabinetImagePath).toBe('/assets/cabinets/cult-classics-season-2.png');
    expect(cultPreset?.overlay).toBe('neon');
    expect(cultPreset?.cssVars['--cc-accent']).toBe('#8f33ff');
    expect(cultPreset?.cssVars['--cc-glow']).toContain('255, 61, 173');
    expect(cultPreset?.cssVars['--cc-highlight']).toBe('#54d6ff');
  });

  it('resolves cult config when cult-classics pack is selected', () => {
    const config = getThemeConfigForPackSlug('cult-classics');
    expect(config.themeName).toBe('cult');
    expect(config.cabinetImagePath).toBe('/assets/cabinets/cult-classics-season-2.png');
  });
});
