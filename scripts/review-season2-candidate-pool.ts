import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

type CandidateRow = {
  tmdbId: number;
  title: string;
  year: number | null;
  genres: string[];
  tmdbRating: number | null;
  tmdbPopularity: number | null;
  voteCount: number | null;
  tags: string[];
  bucket: 'keep' | 'review' | 'reject';
  reasons: string[];
};

const CULT_GENRES = new Set([
  'horror',
  'thriller',
  'science fiction',
  'fantasy',
  'comedy',
  'drama',
  'adventure',
  'action',
  'crime',
  'mystery',
  'music',
]);

const REJECT_KEYWORDS = [
  'avengers',
  'justice league',
  'captain america',
  'captain marvel',
  'wonder woman',
  'spider-man',
  'batman',
  'superman',
  'star wars',
  'harry potter',
  'transformers',
  'pirates of the caribbean',
  'how to train your dragon',
  'frozen',
];

function toNumber(input: string | null): number | null {
  if (!input) {
    return null;
  }
  const parsed = Number.parseFloat(input);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeGenres(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
    .filter((item) => item.length > 0);
}

function bucketCandidate(input: {
  title: string;
  genres: string[];
  tmdbRating: number | null;
  tmdbPopularity: number | null;
  voteCount: number | null;
}): { bucket: 'keep' | 'review' | 'reject'; reasons: string[] } {
  const title = input.title.toLowerCase();
  const reasons: string[] = [];

  if (REJECT_KEYWORDS.some((keyword) => title.includes(keyword))) {
    reasons.push('mainstream-franchise-keyword');
  }

  if ((input.voteCount ?? 0) < 50) {
    reasons.push('low-vote-count');
  }

  if ((input.tmdbRating ?? 0) < 5.0) {
    reasons.push('low-rating');
  }

  if (!input.genres.some((genre) => CULT_GENRES.has(genre))) {
    reasons.push('genre-outside-cult-buckets');
  }

  if (reasons.includes('mainstream-franchise-keyword')) {
    return { bucket: 'reject', reasons };
  }

  if (reasons.length > 1) {
    return { bucket: 'review', reasons };
  }

  return { bucket: 'keep', reasons: reasons.length > 0 ? reasons : ['passes-baseline'] };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.movie.findMany({
      select: {
        tmdbId: true,
        title: true,
        year: true,
        genres: true,
        ratings: {
          where: {
            source: {
              in: ['TMDB', 'TMDB_POPULARITY', 'TMDB_VOTE_COUNT'],
            },
          },
          select: {
            source: true,
            rawValue: true,
            value: true,
          },
        },
      },
      orderBy: { tmdbId: 'asc' },
    });

    const candidates: CandidateRow[] = rows
      .map((row) => {
        const genres = normalizeGenres(row.genres);
        if (!genres.some((genre) => CULT_GENRES.has(genre))) {
          return null;
        }
        const tmdbRatingRaw = row.ratings.find((rating) => rating.source === 'TMDB')?.rawValue ?? null;
        const tmdbPopularityRaw = row.ratings.find((rating) => rating.source === 'TMDB_POPULARITY')?.rawValue ?? null;
        const tmdbVoteCountRaw = row.ratings.find((rating) => rating.source === 'TMDB_VOTE_COUNT')?.rawValue ?? null;
        const tmdbRating = toNumber(tmdbRatingRaw ?? null);
        const tmdbPopularity = toNumber(tmdbPopularityRaw ?? null);
        const voteCount = toNumber(tmdbVoteCountRaw ?? null);
        const evaluated = bucketCandidate({
          title: row.title,
          genres,
          tmdbRating,
          tmdbPopularity,
          voteCount,
        });
        return {
          tmdbId: row.tmdbId,
          title: row.title,
          year: row.year,
          genres,
          tmdbRating,
          tmdbPopularity,
          voteCount,
          tags: [],
          bucket: evaluated.bucket,
          reasons: evaluated.reasons,
        } satisfies CandidateRow;
      })
      .filter((row): row is CandidateRow => row !== null)
      .sort((a, b) => a.title.localeCompare(b.title));

    const summary = {
      generatedAt: new Date().toISOString(),
      total: candidates.length,
      keep: candidates.filter((item) => item.bucket === 'keep').length,
      review: candidates.filter((item) => item.bucket === 'review').length,
      reject: candidates.filter((item) => item.bucket === 'reject').length,
    };

    const outPath = resolve('docs/season/season-2-cult-candidates-full-review.json');
    await mkdir(resolve('docs/season'), { recursive: true });
    await writeFile(
      outPath,
      `${JSON.stringify({ summary, candidates }, null, 2)}\n`,
      'utf8',
    );

    console.log(
      `[season2.review] exported ${summary.total} candidates (keep=${summary.keep}, review=${summary.review}, reject=${summary.reject}) -> ${outPath}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[season2.review] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

