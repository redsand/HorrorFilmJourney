import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { zMovieCardVM } from '@/contracts/movieCardVM';
import {
  createAcceptancePrisma,
  resetAcceptanceDatabase,
  setupAcceptanceDatabase,
} from './utils/recommendations-seed';

const acceptanceSchemaName = 'narrative_experience_acceptance_test';
const acceptancePrisma = createAcceptancePrisma(acceptanceSchemaName);

vi.mock('@/lib/prisma', () => ({
  prisma: acceptancePrisma,
}));

const { POST: POST_USERS } = await import('@/app/api/users/route');
const { POST: POST_ONBOARDING } = await import('@/app/api/onboarding/route');
const { GET: GET_EXPERIENCE } = await import('@/app/api/experience/route');
const { POST: POST_RECOMMENDATIONS_NEXT } = await import('@/app/api/recommendations/next/route');
const { POST: POST_INTERACTIONS } = await import('@/app/api/interactions/route');
const { GET: GET_HISTORY } = await import('@/app/api/history/route');
const { GET: GET_HISTORY_SUMMARY } = await import('@/app/api/history/summary/route');
const { GET: GET_COMPANION } = await import('@/app/api/companion/route');

type RecommendationCard = {
  movie: {
    tmdbId: number;
    posterUrl: string;
  };
  ratings: {
    imdb?: unknown;
    additional: unknown[];
  };
  reception: unknown;
  credits: {
    castHighlights: unknown[];
  };
  codex: {
    watchFor: unknown[];
  };
  evidence: unknown[];
  streaming: {
    region: string;
    offers: unknown[];
  };
};

async function seedMovieCatalog(): Promise<void> {
  for (let index = 0; index < 7; index += 1) {
    const tmdbId = 1100 + index;
    const movie = await acceptancePrisma.movie.create({
      data: {
        tmdbId,
        title: `Narrative Acceptance ${tmdbId}`,
        year: 1985 + index,
        posterUrl: `https://image.tmdb.org/t/p/w500/${tmdbId}.jpg`,
        genres: ['horror', index % 2 === 0 ? 'psychological' : 'supernatural'],
        director: index === 0 ? 'Director Seed' : null,
        castTop: index === 0 ? [{ name: 'Performer One', role: 'Lead' }] : [],
      },
    });

    await acceptancePrisma.movieRating.createMany({
      data: [
        { movieId: movie.id, source: 'IMDB', value: 7.2 + index * 0.1, scale: '10', rawValue: `${(7.2 + index * 0.1).toFixed(1)}/10` },
        { movieId: movie.id, source: 'ROTTEN_TOMATOES', value: 71 + index, scale: '100', rawValue: `${71 + index}%` },
        { movieId: movie.id, source: 'METACRITIC', value: 66 + index, scale: '100', rawValue: `${66 + index}/100` },
      ],
    });

    await acceptancePrisma.evidencePacket.create({
      data: {
        movieId: movie.id,
        sourceName: 'Acceptance Evidence',
        url: `https://example.com/evidence/${tmdbId}`,
        snippet: `Evidence snippet for ${tmdbId}`,
        retrievedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
  }
}

describe('narrative experience acceptance', () => {
  beforeAll(() => {
    setupAcceptanceDatabase(acceptanceSchemaName);
  });

  beforeEach(async () => {
    process.env.ADMIN_TOKEN = 'acceptance-admin-token';
    delete process.env.REC_ENGINE_MODE;
    await resetAcceptanceDatabase(acceptancePrisma);
    await seedMovieCatalog();
  });

  it('enforces onboarding -> recommendations -> interactions -> history -> companion flow', async () => {
    const createUserResponse = await POST_USERS(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': 'acceptance-admin-token',
        },
        body: JSON.stringify({ displayName: 'NarrativeUserA' }),
      }),
    );

    expect(createUserResponse.status).toBe(200);
    const createUserBody = await createUserResponse.json();
    const userId = createUserBody.data.id as string;

    const otherUser = await acceptancePrisma.user.create({
      data: {
        displayName: 'NarrativeUserB',
        profile: { create: { tolerance: 3, pacePreference: 'balanced' } },
      },
    });

    const experienceBeforeOnboarding = await GET_EXPERIENCE(
      new Request('http://localhost/api/experience', {
        headers: {
          'x-admin-token': 'acceptance-admin-token',
          'x-user-id': userId,
        },
      }),
    );
    expect(experienceBeforeOnboarding.status).toBe(200);
    const beforeOnboardingBody = await experienceBeforeOnboarding.json();
    expect(beforeOnboardingBody.data.state).toBe('ONBOARDING_NEEDED');
    expect(Array.isArray(beforeOnboardingBody.data.onboardingQuestions)).toBe(true);

    const onboardingResponse = await POST_ONBOARDING(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': 'acceptance-admin-token',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          tolerance: 4,
          pacePreference: 'balanced',
          horrorDNA: { subgenres: ['psychological', 'supernatural'] },
        }),
      }),
    );
    expect(onboardingResponse.status).toBe(200);

    const experienceAfterOnboarding = await GET_EXPERIENCE(
      new Request('http://localhost/api/experience', {
        headers: {
          'x-admin-token': 'acceptance-admin-token',
          'x-user-id': userId,
        },
      }),
    );
    expect(experienceAfterOnboarding.status).toBe(200);
    const afterOnboardingBody = await experienceAfterOnboarding.json();
    expect(afterOnboardingBody.data.state).toBe('SHOW_RECOMMENDATION_BUNDLE');

    const recommendationsResponse = await POST_RECOMMENDATIONS_NEXT(
      new Request('http://localhost/api/recommendations/next', {
        method: 'POST',
        headers: {
          'x-admin-token': 'acceptance-admin-token',
          'x-user-id': userId,
        },
      }),
    );
    expect(recommendationsResponse.status).toBe(200);
    const recommendationsBody = await recommendationsResponse.json();
    expect(Array.isArray(recommendationsBody.data.cards)).toBe(true);
    expect(recommendationsBody.data.cards).toHaveLength(5);

    const cards = recommendationsBody.data.cards as RecommendationCard[];
    for (const card of cards) {
      expect(zMovieCardVM.safeParse(card).success).toBe(true);
      expect(typeof card.movie.posterUrl).toBe('string');
      expect(card.movie.posterUrl.length).toBeGreaterThan(0);
      expect(Boolean(card.ratings.imdb)).toBe(true);
      expect(card.ratings.additional.length).toBeGreaterThanOrEqual(1);
      expect(card).toHaveProperty('reception');
      expect(card).toHaveProperty('evidence');
      expect(Array.isArray(card.evidence)).toBe(true);
      expect(card).toHaveProperty('streaming');
      expect(typeof card.streaming.region).toBe('string');
      expect(Array.isArray(card.streaming.offers)).toBe(true);
      expect(card.codex.watchFor).toHaveLength(3);
      // R8 allows cast highlights "where available"; empty array is the documented fallback for missing cast metadata.
      expect(Array.isArray(card.credits.castHighlights)).toBe(true);
    }

    const alreadySeenWithoutRating = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': 'acceptance-admin-token',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          tmdbId: cards[0]!.movie.tmdbId,
          status: 'ALREADY_SEEN',
        }),
      }),
    );
    expect(alreadySeenWithoutRating.status).toBe(400);

    const watchedWithoutRating = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': 'acceptance-admin-token',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          tmdbId: cards[1]!.movie.tmdbId,
          status: 'WATCHED',
        }),
      }),
    );
    expect(watchedWithoutRating.status).toBe(400);

    const alreadySeenWithQuickPoll = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': 'acceptance-admin-token',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          tmdbId: cards[0]!.movie.tmdbId,
          status: 'ALREADY_SEEN',
          rating: 4,
          intensity: 3,
          emotions: ['tense'],
          workedBest: ['pacing'],
          agedWell: 'yes',
        }),
      }),
    );
    expect(alreadySeenWithQuickPoll.status).toBe(200);

    const watchedWithQuickPoll = await POST_INTERACTIONS(
      new Request('http://localhost/api/interactions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': 'acceptance-admin-token',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          tmdbId: cards[1]!.movie.tmdbId,
          status: 'WATCHED',
          rating: 5,
          intensity: 4,
          emotions: ['dread'],
          workedBest: ['sound design'],
          agedWell: 'mostly',
        }),
      }),
    );
    expect(watchedWithQuickPoll.status).toBe(200);

    const otherUserMovie = await acceptancePrisma.movie.findUniqueOrThrow({
      where: { tmdbId: 1106 },
      select: { id: true },
    });
    await acceptancePrisma.userMovieInteraction.create({
      data: {
        userId: otherUser.id,
        movieId: otherUserMovie.id,
        status: 'WATCHED',
        rating: 2,
      },
    });

    const historyResponse = await GET_HISTORY(
      new Request('http://localhost/api/history?limit=20', {
        headers: {
          'x-admin-token': 'acceptance-admin-token',
          'x-user-id': userId,
        },
      }),
    );
    expect(historyResponse.status).toBe(200);
    const historyBody = await historyResponse.json();
    const historyItems = historyBody.data.items as Array<{ status: string; movie: { tmdbId: number } }>;
    expect(historyItems.length).toBe(2);
    expect(historyItems.some((item) => item.status === 'ALREADY_SEEN')).toBe(true);
    expect(historyItems.some((item) => item.status === 'WATCHED')).toBe(true);
    expect(historyItems.every((item) => item.movie.tmdbId !== 1106)).toBe(true);

    const historySummaryResponse = await GET_HISTORY_SUMMARY(
      new Request('http://localhost/api/history/summary', {
        headers: {
          'x-admin-token': 'acceptance-admin-token',
          'x-user-id': userId,
        },
      }),
    );
    expect(historySummaryResponse.status).toBe(200);
    const summaryBody = await historySummaryResponse.json();
    expect(summaryBody.data.countsByStatus.ALREADY_SEEN).toBe(1);
    expect(summaryBody.data.countsByStatus.WATCHED).toBe(1);
    expect(summaryBody.data.avgRatingWatchedOrAlreadySeen).toBe(4.5);

    const companionResponse = await GET_COMPANION(
      new Request(`http://localhost/api/companion?tmdbId=${cards[0]!.movie.tmdbId}&spoilerPolicy=NO_SPOILERS`, {
        headers: {
          'x-admin-token': 'acceptance-admin-token',
          'x-user-id': userId,
        },
      }),
    );
    expect(companionResponse.status).toBe(200);
    const companionBody = await companionResponse.json();
    expect(companionBody.data.spoilerPolicy).toBe('NO_SPOILERS');
    expect(companionBody.data.movie.tmdbId).toBe(cards[0]!.movie.tmdbId);
    expect(Array.isArray(companionBody.data.sections.productionNotes)).toBe(true);
    expect(Array.isArray(companionBody.data.evidence)).toBe(true);
  });
});
