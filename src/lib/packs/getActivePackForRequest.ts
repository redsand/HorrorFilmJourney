import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { readSessionFromRequest } from '@/lib/auth/session';

function getCookieHeader(): string | null {
  try {
    return headers().get('cookie');
  } catch {
    return null;
  }
}

export async function getActivePackForRequest(): Promise<{ packSlug: string }> {
  const cookie = getCookieHeader();
  if (!cookie) {
    return { packSlug: 'horror' };
  }

  const request = new Request('http://local.cinemacodex/layout', {
    headers: { cookie },
  });
  const session = readSessionFromRequest(request);
  if (!session) {
    return { packSlug: 'horror' };
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
              isActive: true,
            },
          },
        },
      },
    },
  });

  const packSlug = (profile?.selectedPack?.isEnabled && profile.selectedPack.season.isActive)
    ? profile.selectedPack.slug
    : 'horror';
  return { packSlug };
}
