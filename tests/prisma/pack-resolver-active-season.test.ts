import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';
import { buildTestDatabaseUrl, prismaDbPush } from '../helpers/test-db';

const testDbUrl = buildTestDatabaseUrl('pack_resolver_active_season_test');

const prisma = new PrismaClient({
  datasources: {
    db: { url: testDbUrl },
  },
});

beforeAll(() => {
  prismaDbPush(testDbUrl);
});

beforeEach(async () => {
  process.env.SEASONS_PACKS_ENABLED = 'true';
  await prisma.recommendationDiagnostics.deleteMany();
  await prisma.userMovieInteraction.deleteMany();
  await prisma.recommendationItem.deleteMany();
  await prisma.recommendationBatch.deleteMany();
  await prisma.journeyProgress.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.journeyNode.deleteMany();
  await prisma.genrePack.deleteMany();
  await prisma.season.deleteMany();
  await prisma.user.deleteMany();
});

describe('resolveEffectivePackForUser user-specific selection', () => {
  it('keeps the user-selected enabled pack even if that season is globally inactive', async () => {
    const season1 = await prisma.season.create({
      data: { slug: 'season-1', name: 'Season 1', isActive: false },
    });
    const season2 = await prisma.season.create({
      data: { slug: 'season-2', name: 'Season 2', isActive: true },
    });
    const horrorPack = await prisma.genrePack.create({
      data: {
        slug: 'horror',
        name: 'Horror',
        seasonId: season1.id,
        isEnabled: true,
        primaryGenre: 'horror',
      },
    });
    const cultPack = await prisma.genrePack.create({
      data: {
        slug: 'cult-classics',
        name: 'Cult Classics',
        seasonId: season2.id,
        isEnabled: true,
        primaryGenre: 'cult',
      },
    });
    const user = await prisma.user.create({
      data: {
        displayName: 'Season switch user',
        profile: {
          create: {
            onboardingCompleted: true,
            tolerance: 3,
            pacePreference: 'balanced',
            selectedPackId: horrorPack.id,
          },
        },
      },
    });

    const effective = await resolveEffectivePackForUser(prisma, user.id);

    expect(effective.packSlug).toBe('horror');
    expect(effective.seasonSlug).toBe('season-1');
    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: {
        selectedPack: {
          select: {
            slug: true,
            season: { select: { slug: true } },
          },
        },
      },
    });
    expect(profile?.selectedPack?.slug).toBe(horrorPack.slug);
    expect(profile?.selectedPack?.season.slug).toBe('season-1');
  });
});
