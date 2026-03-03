'use client';

import { useEffect } from 'react';

type ThemeProviderProps = {
  theme?: string;
  cssVars?: Record<string, string>;
};

export function ThemeProvider({ theme = 'horror', cssVars = {} }: ThemeProviderProps) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [cssVars, theme]);

  return null;
}
