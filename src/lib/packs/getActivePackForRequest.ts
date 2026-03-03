import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { readSessionFromRequest } from '@/lib/auth/session';
import {
  DEFAULT_PACK_SLUG,
  DEFAULT_SEASON_DESCRIPTION,
  DEFAULT_SEASON_NAME,
} from '@/lib/packs/constants';

function getCookieHeader(): string | null {
  try {
    return headers().get('cookie');
  } catch {
    return null;
  }
}

export async function getActivePackForRequest(): Promise<{
  packSlug: string;
  seasonName: string;
  seasonDescription: string;
}> {
  const cookie = getCookieHeader();
  if (!cookie) {
    return {
      packSlug: DEFAULT_PACK_SLUG,
      seasonName: DEFAULT_SEASON_NAME,
      seasonDescription: DEFAULT_SEASON_DESCRIPTION,
    };
  }

  const request = new Request('http://local.cinemacodex/layout', {
    headers: { cookie },
  });
  const session = readSessionFromRequest(request);
  if (!session) {
    return {
      packSlug: DEFAULT_PACK_SLUG,
      seasonName: DEFAULT_SEASON_NAME,
      seasonDescription: DEFAULT_SEASON_DESCRIPTION,
    };
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId: session.userId },
    select: {
      selectedPack: {
        select: {
          slug: true,
          isEnabled: true,
          season: {
            select: {
              name: true,
              description: true,
            },
          },
        },
      },
    },
  });

  const packSlug = profile?.selectedPack?.isEnabled
    ? profile.selectedPack.slug
    : DEFAULT_PACK_SLUG;
  const seasonName = profile?.selectedPack?.isEnabled
    ? profile.selectedPack.season.name
    : DEFAULT_SEASON_NAME;
  const seasonDescription = profile?.selectedPack?.isEnabled
    ? (profile.selectedPack.season.description?.trim() || DEFAULT_SEASON_DESCRIPTION)
    : DEFAULT_SEASON_DESCRIPTION;

  return {
    packSlug,
    seasonName,
    seasonDescription,
  };
}
