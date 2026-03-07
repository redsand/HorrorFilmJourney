/**
 * enrich-season3-missing-wikipedia.ts
 *
 * For each season-3 movie without a Wikipedia evidence doc, use the Wikipedia
 * opensearch API to find the correct page title, fetch the full article via
 * w/api.php, then ingest into the DB.
 *
 * Usage:
 *   npx tsx scripts/enrich-season3-missing-wikipedia.ts
 *   npx tsx scripts/enrich-season3-missing-wikipedia.ts --dry-run   # print matches only
 *   npx tsx scripts/enrich-season3-missing-wikipedia.ts --limit 50  # process N movies
 */

import { PrismaClient } from '@prisma/client';
import { ingestEvidenceDocuments } from '../src/lib/evidence/ingestion/index';

const DELAY_MS = 250;
const MIN_CONTENT_LENGTH = 2000;

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.findIndex(a => a === '--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? '0', 10) : 0;
  return { dryRun, limit };
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchByTitle(pageTitle: string): Promise<{ content: string; url: string } | null> {
  const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=true&titles=${encodeURIComponent(pageTitle)}&format=json&redirects=true`;
  try {
    const res = await fetch(apiUrl, { headers: { 'User-Agent': 'CinemaCodex/1.0' } });
    if (!res.ok) return null;
    const data = await res.json() as { query?: { pages?: Record<string, { extract?: string; title?: string }> } };
    const pages = data.query?.pages;
    if (!pages) return null;
    const pageId = Object.keys(pages)[0];
    if (!pageId || pageId === '-1') return null;
    const extract = pages[pageId]?.extract;
    const resolvedTitle = pages[pageId]?.title ?? pageTitle;
    if (!extract || extract.length < MIN_CONTENT_LENGTH) return null;
    if (extract.includes('may refer to:') || extract.includes('can refer to:')) return null;
    return {
      content: extract,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(resolvedTitle.replace(/ /g, '_'))}`,
    };
  } catch {
    return null;
  }
}

async function findWikipediaArticle(title: string, year: number | null): Promise<{ content: string; url: string } | null> {
  // Strategy 1: try direct title formats (bare title first — most common Wikipedia pattern)
  const directFormats = year
    ? [title, `${title} (film)`, `${title} (${year} film)`]
    : [title, `${title} (film)`];

  for (const fmt of directFormats) {
    const result = await fetchByTitle(fmt);
    if (result) return result;
    await sleep(150);
  }

  // Strategy 2: opensearch with bare title — catches title variants (e.g. "Xtro II" vs "Xtro 2")
  const osUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(title)}&limit=5&namespace=0&format=json`;
  try {
    const osRes = await fetch(osUrl, { headers: { 'User-Agent': 'CinemaCodex/1.0' } });
    if (osRes.ok) {
      const osData = await osRes.json() as [string, string[], string[], string[]];
      const osTitles: string[] = osData[1] ?? [];
      for (const candidate of osTitles) {
        if (candidate.toLowerCase() === title.toLowerCase()) continue; // already tried
        const result = await fetchByTitle(candidate);
        if (result) return result;
        await sleep(150);
      }
    }
  } catch { /* ignore */ }

  return null;
}

async function main(): Promise<void> {
  const { dryRun, limit } = parseArgs();
  const prisma = new PrismaClient();

  try {
    // 1. Find season-3 movies without Wikipedia docs
    const withWiki = await prisma.evidenceDocument.findMany({
      where: { seasonSlug: 'season-3', sourceName: 'wikipedia' },
      select: { movieId: true },
    });
    const withWikiMovieIds = new Set(withWiki.map(d => d.movieId));

    const allS3 = await prisma.evidenceDocument.findMany({
      where: { seasonSlug: 'season-3' },
      distinct: ['movieId'],
      select: {
        movieId: true,
        movie: { select: { id: true, tmdbId: true, title: true, year: true } },
      },
    });

    let missing = allS3
      .filter(d => !withWikiMovieIds.has(d.movieId))
      .map(d => d.movie)
      .filter(Boolean);

    if (limit > 0) missing = missing.slice(0, limit);

    console.log(`Movies missing Wikipedia: ${missing.length}${limit ? ` (capped at ${limit})` : ''}`);
    if (dryRun) console.log('-- DRY RUN: will not write to DB --');
    console.log('');

    let found = 0;
    let failed = 0;

    for (let i = 0; i < missing.length; i++) {
      const movie = missing[i];
      if (!movie) continue;

      const label = `[${i + 1}/${missing.length}] ${movie.title} (${movie.year ?? '?'})`;
      process.stdout.write(`${label}... `);

      const article = await findWikipediaArticle(movie.title, movie.year);

      if (!article) {
        process.stdout.write('not found\n');
        failed++;
        await sleep(DELAY_MS);
        continue;
      }

      process.stdout.write(`ok (${article.content.length} chars)\n`);
      found++;

      if (!dryRun) {
        await ingestEvidenceDocuments(prisma, [{
          movieId: `tmdb:${movie.tmdbId}`,
          seasonSlug: 'season-3',
          sourceName: 'wikipedia',
          url: article.url,
          title: movie.title,
          content: article.content,
          license: 'CC-BY-SA',
        }]);
      }

      await sleep(DELAY_MS);
    }

    console.log('');
    console.log(`Done. Found: ${found}, Not found: ${failed}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(err => {
  console.error('[enrich-season3-missing-wikipedia] failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
