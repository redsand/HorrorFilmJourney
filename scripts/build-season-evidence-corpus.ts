import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

type CliOptions = {
  season: 'season-1' | 'season-2' | 'season-3';
  pack?: string;
  includeWikipedia: boolean;
  includeTmdb: boolean;
  output?: string;
};

type EvidenceDocument = {
  movieId: string;
  seasonSlug?: string;
  sourceName: string;
  url: string;
  title: string;
  content: string;
  publishedAt?: string;
  license?: string;
};

const SEASON_PACK_MAP: Record<string, string> = {
  'season-1': 'horror',
  'season-2': 'cult-classics',
  'season-3': 'sci-fi',
};

function parseCli(): CliOptions {
  const args = process.argv.slice(2);
  const seasonIndex = args.findIndex((arg) => arg === '--season');
  if (seasonIndex === -1 || !args[seasonIndex + 1]) {
    throw new Error('Missing required flag: --season <season-1|season-2|season-3>');
  }
  const season = args[seasonIndex + 1] as CliOptions['season'];
  if (!['season-1', 'season-2', 'season-3'].includes(season)) {
    throw new Error(`Invalid season: ${season}. Must be season-1, season-2, or season-3.`);
  }
  const packIndex = args.findIndex((arg) => arg === '--pack');
  const pack = packIndex !== -1 ? args[packIndex + 1] : undefined;
  const includeWikipedia = !args.includes('--no-wikipedia');
  const includeTmdb = !args.includes('--no-tmdb');
  const outputIndex = args.findIndex((arg) => arg === '--output');
  const output = outputIndex !== -1 ? args[outputIndex + 1] : undefined;
  return { season, pack, includeWikipedia, includeTmdb, output };
}

async function fetchWikipediaContent(title: string, year: number | null): Promise<{ content: string; url: string } | null> {
  // Try multiple title formats — same approach as enrich-wikipedia-full.ts (w/api.php, full article)
  const titleFormats = year
    ? [
        `${title} (${year} film)`,
        `${title} (film)`,
        title,
      ]
    : [title, `${title} (film)`];

  for (const format of titleFormats) {
    try {
      const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=true&titles=${encodeURIComponent(format)}&format=json&redirects=true`;
      const response = await fetch(apiUrl, { headers: { 'User-Agent': 'CinemaCodex/1.0' } });
      if (!response.ok) continue;
      const data = await response.json() as { query?: { pages?: Record<string, { extract?: string }> } };
      const pages = data.query?.pages;
      if (!pages) continue;
      const pageId = Object.keys(pages)[0];
      if (!pageId || pageId === '-1') continue;
      const extract = pages[pageId]?.extract;
      if (!extract || extract.length < 100) continue;
      if (extract.includes('may refer to:')) continue;
      return {
        content: extract,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(format.replace(/ /g, '_'))}`,
      };
    } catch {
      continue;
    }
  }

  return null;
}

async function main(): Promise<void> {
  const cli = parseCli();
  const prisma = new PrismaClient();

  const packSlug = cli.pack || SEASON_PACK_MAP[cli.season];
  if (!packSlug) {
    throw new Error(`No pack mapping for season: ${cli.season}`);
  }

  console.log(`Building evidence corpus for ${cli.season}/${packSlug}`);
  console.log(`  Wikipedia: ${cli.includeWikipedia ? 'enabled' : 'disabled'}`);
  console.log(`  TMDB: ${cli.includeTmdb ? 'enabled' : 'disabled'}`);

  try {
    // Get all movies assigned to nodes in this season/pack
    const assignments = await prisma.nodeMovie.findMany({
      where: {
        node: {
          pack: {
            slug: packSlug,
            season: { slug: cli.season },
          },
        },
      },
      select: {
        tier: true,
        movie: {
          select: {
            id: true,
            tmdbId: true,
            title: true,
            year: true,
            synopsis: true,
          },
        },
        node: {
          select: {
            slug: true,
          },
        },
      },
    });

    console.log(`Found ${assignments.length} movie assignments`);

    // Deduplicate by movie
    const movieMap = new Map<string, typeof assignments[0]['movie'] & { nodes: string[] }>();
    for (const assignment of assignments) {
      const existing = movieMap.get(assignment.movie.id);
      if (existing) {
        existing.nodes.push(assignment.node.slug);
      } else {
        movieMap.set(assignment.movie.id, {
          ...assignment.movie,
          nodes: [assignment.node.slug],
        });
      }
    }

    const documents: EvidenceDocument[] = [];
    let wikipediaSuccess = 0;
    let wikipediaFailed = 0;
    let tmdbSuccess = 0;
    let tmdbSkipped = 0;

    for (const [, movie] of movieMap) {
      const movieIdentifier = `${movie.title} (${movie.year ?? 'unknown'})`;

      // TMDB synopsis
      if (cli.includeTmdb && movie.synopsis && movie.synopsis.trim().length > 50) {
        documents.push({
          movieId: `tmdb:${movie.tmdbId}`,
          seasonSlug: cli.season,
          sourceName: 'tmdb',
          url: `https://www.themoviedb.org/movie/${movie.tmdbId}`,
          title: movie.title,
          content: movie.synopsis.trim(),
          license: 'TMDB',
        });
        tmdbSuccess++;
      } else {
        tmdbSkipped++;
      }

      // Wikipedia article
      if (cli.includeWikipedia) {
        const wiki = await fetchWikipediaContent(movie.title, movie.year);
        if (wiki) {
          documents.push({
            movieId: `tmdb:${movie.tmdbId}`,
            seasonSlug: cli.season,
            sourceName: 'wikipedia',
            url: wiki.url,
            title: movie.title,
            content: wiki.content,
            license: 'CC-BY-SA',
          });
          wikipediaSuccess++;
        } else {
          wikipediaFailed++;
        }
      }

      // Small delay to be nice to Wikipedia API
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`\nResults:`);
    console.log(`  TMDB: ${tmdbSuccess} documents, ${tmdbSkipped} skipped (no synopsis)`);
    console.log(`  Wikipedia: ${wikipediaSuccess} documents, ${wikipediaFailed} failed`);
    console.log(`  Total: ${documents.length} documents`);

    // Write corpus file
    const outputDir = resolve('docs/evidence');
    await mkdir(outputDir, { recursive: true });
    
    const outputPath = cli.output || resolve(outputDir, `${cli.season}-${packSlug}-corpus.json`);
    
    const corpus = {
      generatedAt: new Date().toISOString(),
      season: cli.season,
      pack: packSlug,
      movieCount: movieMap.size,
      documentCount: documents.length,
      documents,
    };

    await writeFile(outputPath, JSON.stringify(corpus, null, 2), 'utf8');
    console.log(`\nCorpus written: ${outputPath}`);
    console.log(`  Movies: ${movieMap.size}`);
    console.log(`  Documents: ${documents.length}`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to build corpus:', error);
  process.exit(1);
});
