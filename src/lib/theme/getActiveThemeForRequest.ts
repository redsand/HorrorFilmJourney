import { unstable_noStore as noStore } from 'next/cache';
import { getActivePackForRequest } from '@/lib/packs/getActivePackForRequest';
import { getThemeConfigForPackSlug } from '@/lib/theme/themes';

export type ActiveThemeForRequest = {
  packSlug: string;
  theme: ReturnType<typeof getThemeConfigForPackSlug>;
};

export async function getActiveThemeForRequest(): Promise<ActiveThemeForRequest> {
  noStore();
  const { packSlug } = await getActivePackForRequest();
  return {
    packSlug,
    theme: getThemeConfigForPackSlug(packSlug),
  };
}
