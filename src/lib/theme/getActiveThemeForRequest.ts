import { cache } from 'react';
import { getActivePackForRequest } from '@/lib/packs/getActivePackForRequest';
import { getThemeConfigForPackSlug } from '@/lib/theme/themes';

export type ActiveThemeForRequest = {
  packSlug: string;
  theme: ReturnType<typeof getThemeConfigForPackSlug>;
};

const cacheSafe = typeof cache === 'function'
  ? cache
  : (<T extends (...args: never[]) => Promise<ActiveThemeForRequest>>(fn: T) => fn);

export const getActiveThemeForRequest = cacheSafe(async (): Promise<ActiveThemeForRequest> => {
  const { packSlug } = await getActivePackForRequest();
  return {
    packSlug,
    theme: getThemeConfigForPackSlug(packSlug),
  };
});
