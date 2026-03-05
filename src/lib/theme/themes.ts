export type ThemeKey = 'horror' | 'scifi' | 'fantasy' | 'western' | 'cult';

export type ThemeConfig = {
  themeName: ThemeKey;
  cabinetImagePath: string;
  marqueeLabel: string;
  tokens: Record<string, string>;
  cssVars: Record<string, string>;
  overlay?: 'mist' | 'neon';
  enabled: boolean;
};

const HORROR_TOKENS: Record<string, string> = {
  '--cc-bg': '#060607',
  '--cc-surface': '#101014',
  '--cc-surface-2': '#17171c',
  '--cc-text': '#f7f3ef',
  '--cc-text-muted': '#b9b3ad',
  '--cc-border': 'rgba(255, 255, 255, 0.14)',
  '--cc-accent': '#9b111e',
  '--cc-accent-2': '#cf1c2a',
  '--cc-danger': '#e54957',
  '--cc-glow': 'rgba(233, 84, 102, 0.24)',
  '--cc-shadow': 'rgba(0, 0, 0, 0.5)',
  '--cc-focus': '#f07922',
  '--cc-link': '#ff5a45',
  '--cc-success': '#3fa576',
  '--cc-warning': '#e0a43b',
  '--cc-mist': '#5b8f78',
};

const SCIFI_TOKENS: Record<string, string> = {
  '--cc-bg': '#050915',
  '--cc-surface': '#0b1324',
  '--cc-surface-2': '#111d34',
  '--cc-text': '#eaf6ff',
  '--cc-text-muted': '#9fb6c9',
  '--cc-border': 'rgba(149, 197, 255, 0.2)',
  '--cc-accent': '#21b6ff',
  '--cc-accent-2': '#57d4ff',
  '--cc-danger': '#ff6b7a',
  '--cc-glow': 'rgba(33, 182, 255, 0.2)',
  '--cc-shadow': 'rgba(0, 0, 0, 0.5)',
  '--cc-focus': '#79e3ff',
  '--cc-link': '#8ddfff',
  '--cc-success': '#35c7a8',
  '--cc-warning': '#ffbc66',
};

const FANTASY_TOKENS: Record<string, string> = {
  '--cc-bg': '#110b1a',
  '--cc-surface': '#1a1228',
  '--cc-surface-2': '#241837',
  '--cc-text': '#f5edff',
  '--cc-text-muted': '#c4b7da',
  '--cc-border': 'rgba(210, 183, 255, 0.2)',
  '--cc-accent': '#8f5ae8',
  '--cc-accent-2': '#ad7dff',
  '--cc-danger': '#ff6b8b',
  '--cc-glow': 'rgba(173, 125, 255, 0.2)',
  '--cc-shadow': 'rgba(0, 0, 0, 0.55)',
  '--cc-focus': '#d7b6ff',
  '--cc-link': '#c39cff',
  '--cc-success': '#6ccf9f',
  '--cc-warning': '#f0bd6e',
};

const WESTERN_TOKENS: Record<string, string> = {
  '--cc-bg': '#1a130d',
  '--cc-surface': '#241a12',
  '--cc-surface-2': '#302216',
  '--cc-text': '#f5eadc',
  '--cc-text-muted': '#cab69e',
  '--cc-border': 'rgba(222, 185, 133, 0.22)',
  '--cc-accent': '#b7592a',
  '--cc-accent-2': '#d3773b',
  '--cc-danger': '#d95f3e',
  '--cc-glow': 'rgba(211, 119, 59, 0.22)',
  '--cc-shadow': 'rgba(0, 0, 0, 0.55)',
  '--cc-focus': '#e6b36e',
  '--cc-link': '#d98f57',
  '--cc-success': '#7db17d',
  '--cc-warning': '#e3b267',
};

const CULT_CLASSICS_TOKENS: Record<string, string> = {
  '--cc-bg': '#050409',
  '--cc-surface': '#120d1f',
  '--cc-surface-2': '#1b1230',
  '--cc-text': '#f7f1ff',
  '--cc-text-muted': '#baafd2',
  '--cc-border': 'rgba(201, 154, 255, 0.22)',
  '--cc-accent': '#8f33ff',
  '--cc-accent-2': '#b73dff',
  '--cc-danger': '#ff4f95',
  '--cc-glow': 'rgba(255, 61, 173, 0.28)',
  '--cc-shadow': 'rgba(0, 0, 0, 0.62)',
  '--cc-focus': '#ff7ad6',
  '--cc-link': '#d07cff',
  '--cc-success': '#53c79b',
  '--cc-warning': '#f2b25b',
  '--cc-highlight': '#54d6ff',
};

export const HORROR_THEME: ThemeConfig = {
  themeName: 'horror',
  cabinetImagePath: '/assets/cabinets/horror-season-1.png',
  marqueeLabel: 'Season 1: Horror',
  tokens: HORROR_TOKENS,
  cssVars: HORROR_TOKENS,
  overlay: 'mist',
  enabled: true,
};

const THEMES_BY_PACK_SLUG: Record<string, ThemeConfig> = {
  horror: HORROR_THEME,
  'sci-fi': {
    themeName: 'scifi',
    cabinetImagePath: '/assets/cabinets/sci-fi-season-3.png',
    marqueeLabel: 'Season 3: Sci-Fi',
    tokens: SCIFI_TOKENS,
    cssVars: SCIFI_TOKENS,
    enabled: true,
  },
  scifi: {
    themeName: 'scifi',
    cabinetImagePath: '/assets/cabinets/sci-fi-season-3.png',
    marqueeLabel: 'Season 3: Sci-Fi',
    tokens: SCIFI_TOKENS,
    cssVars: SCIFI_TOKENS,
    enabled: true,
  },
  fantasy: {
    themeName: 'fantasy',
    cabinetImagePath: '/assets/cabinets/fantasy-season-1.png',
    marqueeLabel: 'Season X: Fantasy',
    tokens: FANTASY_TOKENS,
    cssVars: FANTASY_TOKENS,
    enabled: false,
  },
  western: {
    themeName: 'western',
    cabinetImagePath: '/assets/cabinets/western-season-1.png',
    marqueeLabel: 'Season X: Western',
    tokens: WESTERN_TOKENS,
    cssVars: WESTERN_TOKENS,
    enabled: false,
  },
  'cult-classics': {
    themeName: 'cult',
    cabinetImagePath: '/assets/cabinets/cult-classics-season-2.png',
    marqueeLabel: 'Season 2: Cult Classics',
    tokens: CULT_CLASSICS_TOKENS,
    cssVars: CULT_CLASSICS_TOKENS,
    overlay: 'neon',
    enabled: true,
  },
};

export function getThemePresetForPackSlug(packSlug: string | null | undefined): ThemeConfig | null {
  if (!packSlug) {
    return null;
  }
  return THEMES_BY_PACK_SLUG[packSlug] ?? null;
}

export function getThemeConfigForPackSlug(packSlug: string | null | undefined): ThemeConfig {
  const preset = getThemePresetForPackSlug(packSlug);
  if (!preset || !preset.enabled) {
    return HORROR_THEME;
  }
  return preset;
}
