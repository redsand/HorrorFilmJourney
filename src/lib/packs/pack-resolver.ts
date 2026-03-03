import type { PrismaClient } from '@prisma/client';
import { seasonsPacksEnabled } from '@/lib/feature-flags';
import {
  DEFAULT_PACK_DESCRIPTION,
  DEFAULT_PACK_NAME,
  DEFAULT_PACK_SLUG,
  DEFAULT_PRIMARY_GENRE,
  DEFAULT_SEASON_NAME,
  DEFAULT_SEASON_SLUG,
} from '@/lib/packs/constants';
import { getThemeConfigForPackSlug, getThemePresetForPackSlug } from '@/lib/theme/themes';

export type EffectivePack = {
  packId: string | null;
  packSlug: string;
  seasonSlug: string;
  primaryGenre: string;
};

async function ensureDefaultPack(prisma: PrismaClient): Promise<{ id: string; slug: string; primaryGenre: string; season: { slug: string } }> {
  const season = await prisma.season.upsert({
    where: { slug: DEFAULT_SEASON_SLUG },
    create: {
      slug: DEFAULT_SEASON_SLUG,
      name: DEFAULT_SEASON_NAME,
      isActive: true,
    },
    update: { name: DEFAULT_SEASON_NAME },
    select: { id: true, slug: true },
  });

  return prisma.genrePack.upsert({
    where: { slug: DEFAULT_PACK_SLUG },
    create: {
      slug: DEFAULT_PACK_SLUG,
      name: DEFAULT_PACK_NAME,
      seasonId: season.id,
      isEnabled: true,
      primaryGenre: DEFAULT_PRIMARY_GENRE,
      description: DEFAULT_PACK_DESCRIPTION,
    },
    update: {
      name: DEFAULT_PACK_NAME,
      isEnabled: true,
      primaryGenre: DEFAULT_PRIMARY_GENRE,
      description: DEFAULT_PACK_DESCRIPTION,
      seasonId: season.id,
    },
    select: {
      id: true,
      slug: true,
      primaryGenre: true,
      season: { select: { slug: true } },
    },
  });
}

async function resolveFallbackPack(prisma: PrismaClient): Promise<{ id: string; slug: string; primaryGenre: string; season: { slug: string } }> {
  const activePack = await prisma.genrePack.findFirst({
    where: {
      isEnabled: true,
      season: { isActive: true },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      slug: true,
      primaryGenre: true,
      season: { select: { slug: true } },
    },
  });
  if (activePack) {
    return activePack;
  }
  return ensureDefaultPack(prisma);
}

export async function resolveEffectivePackForUser(prisma: PrismaClient, userId: string): Promise<EffectivePack> {
  if (!seasonsPacksEnabled()) {
    return {
      packId: null,
      packSlug: DEFAULT_PACK_SLUG,
      seasonSlug: DEFAULT_SEASON_SLUG,
      primaryGenre: DEFAULT_PRIMARY_GENRE,
    };
  }

  const defaultPack = await resolveFallbackPack(prisma);
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      selectedPackId: true,
      selectedPack: {
        select: {
          id: true,
          slug: true,
          isEnabled: true,
          primaryGenre: true,
          season: { select: { slug: true } },
        },
      },
    },
  });

  if (profile?.selectedPack && profile.selectedPack.isEnabled) {
    return {
      packId: profile.selectedPack.id,
      packSlug: profile.selectedPack.slug,
      seasonSlug: profile.selectedPack.season.slug,
      primaryGenre: profile.selectedPack.primaryGenre,
    };
  }

  await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      onboardingCompleted: false,
      tolerance: 3,
      pacePreference: null,
      selectedPackId: defaultPack.id,
      horrorDNA: { recommendationStyle: 'diversity' },
    },
    update: {
      selectedPackId: defaultPack.id,
    },
  });

  return {
    packId: defaultPack.id,
    packSlug: defaultPack.slug,
    seasonSlug: defaultPack.season.slug,
    primaryGenre: defaultPack.primaryGenre,
  };
}

export async function listAvailablePacks(prisma: PrismaClient): Promise<{
  activeSeason: { slug: string; name: string };
  packs: Array<{ slug: string; name: string; isEnabled: boolean; seasonSlug: string; seasonLabel: string; themeKey: string }>;
}> {
  if (!seasonsPacksEnabled()) {
    return {
      activeSeason: { slug: DEFAULT_SEASON_SLUG, name: DEFAULT_SEASON_NAME },
      packs: [{
        slug: DEFAULT_PACK_SLUG,
        name: DEFAULT_PACK_NAME,
        isEnabled: true,
        seasonSlug: DEFAULT_SEASON_SLUG,
        seasonLabel: DEFAULT_SEASON_NAME,
        themeKey: getThemePresetForPackSlug(DEFAULT_PACK_SLUG)?.themeName
          ?? getThemeConfigForPackSlug(DEFAULT_PACK_SLUG).themeName,
      }],
    };
  }

  const defaultPack = await ensureDefaultPack(prisma);
  const activeSeason = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { slug: true, name: true },
  });

  const packs = await prisma.genrePack.findMany({
    where: { isEnabled: true },
    orderBy: [{ seasonId: 'asc' }, { createdAt: 'asc' }],
    select: {
      slug: true,
      name: true,
      isEnabled: true,
      season: { select: { slug: true, name: true } },
    },
  });

  const enabledPacks = packs.filter((pack) => pack.isEnabled);

  return {
    activeSeason: activeSeason ?? { slug: DEFAULT_SEASON_SLUG, name: DEFAULT_SEASON_NAME },
    packs: enabledPacks.length > 0
      ? enabledPacks.map((pack) => ({
        slug: pack.slug,
        name: pack.name,
        isEnabled: pack.isEnabled,
        seasonSlug: pack.season.slug,
        seasonLabel: pack.season.name,
        themeKey: getThemePresetForPackSlug(pack.slug)?.themeName
          ?? getThemeConfigForPackSlug(pack.slug).themeName,
      }))
      : [{
        slug: DEFAULT_PACK_SLUG,
        name: DEFAULT_PACK_NAME,
        isEnabled: true,
        seasonSlug: DEFAULT_SEASON_SLUG,
        seasonLabel: DEFAULT_SEASON_NAME,
        themeKey: getThemePresetForPackSlug(DEFAULT_PACK_SLUG)?.themeName
          ?? getThemeConfigForPackSlug(DEFAULT_PACK_SLUG).themeName,
      }],
  };
}
