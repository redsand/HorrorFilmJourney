import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// ── Output ────────────────────────────────────────────────────────────────────

const OUTPUT_PATH = path.resolve('docs', 'evidence', 'season-3-sci-fi-corpus.json');
const SEASON_SLUG = 'season-3';
const DELAY_MS = 150; // be polite to APIs

// ── Types ─────────────────────────────────────────────────────────────────────

type FilmEntry = {
  tmdbId: number;
  title: string;
  year: number;
  wikipediaTitle: string;
  tier: 'core' | 'extended';
};

type ExternalSource = {
  tmdbId: number;
  sourceName: string;
  url: string;
  label: string;
  license: string;
};

type EvidenceDocument = {
  movieTmdbId: number;
  seasonSlug: string;
  sourceName: string;
  url: string;
  title: string;
  content: string;
  contentHash: string;
  publishedAt: null;
  license: string;
  chunks: [];
};

function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

// ── Film Manifest ─────────────────────────────────────────────────────────────
//
// TMDB IDs sourced from season-3-sci-fi-candidates-scored.json (TMDB API).
// Note: La Jetée=662, Colossus=14801, Mad Max 2=8810 — these differ from
// earlier fallback list entries which should be updated to match.

const FILMS: FilmEntry[] = [
  // ── CORE ──────────────────────────────────────────────────────────────────
  { tmdbId: 19,     title: 'Metropolis',                                     year: 1927, wikipediaTitle: 'Metropolis (1927 film)',                       tier: 'core' },
  { tmdbId: 5765,   title: 'The Day the Earth Stood Still',                  year: 1951, wikipediaTitle: 'The Day the Earth Stood Still (1951 film)',     tier: 'core' },
  { tmdbId: 871,    title: 'Planet of the Apes',                             year: 1968, wikipediaTitle: 'Planet of the Apes (1968 film)',                tier: 'core' },
  { tmdbId: 935,    title: 'Dr. Strangelove',                                year: 1964, wikipediaTitle: 'Dr. Strangelove',                               tier: 'core' },
  { tmdbId: 8338,   title: 'The Manchurian Candidate',                       year: 1962, wikipediaTitle: 'The Manchurian Candidate (1962 film)',           tier: 'core' },
  { tmdbId: 840,    title: 'Close Encounters of the Third Kind',             year: 1977, wikipediaTitle: 'Close Encounters of the Third Kind',            tier: 'core' },
  { tmdbId: 185,    title: 'A Clockwork Orange',                             year: 1971, wikipediaTitle: 'A Clockwork Orange (film)',                     tier: 'core' },
  { tmdbId: 62,     title: '2001: A Space Odyssey',                          year: 1968, wikipediaTitle: '2001: A Space Odyssey (film)',                  tier: 'core' },
  { tmdbId: 1398,   title: 'Stalker',                                        year: 1979, wikipediaTitle: 'Stalker (1979 film)',                           tier: 'core' },
  { tmdbId: 68,     title: 'Brazil',                                         year: 1985, wikipediaTitle: 'Brazil (1985 film)',                            tier: 'core' },
  { tmdbId: 11,     title: 'Star Wars',                                      year: 1977, wikipediaTitle: 'Star Wars (film)',                              tier: 'core' },
  { tmdbId: 1891,   title: 'The Empire Strikes Back',                        year: 1980, wikipediaTitle: 'The Empire Strikes Back',                      tier: 'core' },
  { tmdbId: 329,    title: 'Jurassic Park',                                  year: 1993, wikipediaTitle: 'Jurassic Park (film)',                          tier: 'core' },
  { tmdbId: 78,     title: 'Blade Runner',                                   year: 1982, wikipediaTitle: 'Blade Runner',                                  tier: 'core' },
  { tmdbId: 149,    title: 'Akira',                                          year: 1988, wikipediaTitle: 'Akira (1988 film)',                             tier: 'core' },
  { tmdbId: 9323,   title: 'Ghost in the Shell',                             year: 1995, wikipediaTitle: 'Ghost in the Shell (1995 film)',                tier: 'core' },
  { tmdbId: 603,    title: 'The Matrix',                                     year: 1999, wikipediaTitle: 'The Matrix',                                    tier: 'core' },
  { tmdbId: 218,    title: 'The Terminator',                                 year: 1984, wikipediaTitle: 'The Terminator',                                tier: 'core' },
  { tmdbId: 280,    title: 'Terminator 2: Judgment Day',                     year: 1991, wikipediaTitle: 'Terminator 2: Judgment Day',                    tier: 'core' },
  { tmdbId: 348,    title: 'Alien',                                          year: 1979, wikipediaTitle: 'Alien (film)',                                  tier: 'core' },
  { tmdbId: 1091,   title: 'The Thing',                                      year: 1982, wikipediaTitle: 'The Thing (1982 film)',                         tier: 'core' },
  { tmdbId: 601,    title: 'E.T. the Extra-Terrestrial',                     year: 1982, wikipediaTitle: 'E.T. the Extra-Terrestrial',                    tier: 'core' },
  { tmdbId: 662,    title: 'La Jetée',                                       year: 1962, wikipediaTitle: 'La Jetée',                                      tier: 'core' },
  { tmdbId: 105,    title: 'Back to the Future',                             year: 1985, wikipediaTitle: 'Back to the Future',                            tier: 'core' },
  { tmdbId: 63,     title: 'Twelve Monkeys',                                 year: 1995, wikipediaTitle: 'Twelve Monkeys',                                tier: 'core' },
  { tmdbId: 8810,   title: 'Mad Max 2',                                      year: 1981, wikipediaTitle: 'Mad Max 2',                                     tier: 'core' },
  { tmdbId: 10681,  title: 'WALL·E',                                         year: 2008, wikipediaTitle: 'WALL-E',                                        tier: 'core' },

  // ── EXTENDED ──────────────────────────────────────────────────────────────
  { tmdbId: 17295,  title: 'Fail Safe',                                      year: 1964, wikipediaTitle: 'Fail Safe (1964 film)',                         tier: 'extended' },
  { tmdbId: 1428,   title: 'Alphaville',                                     year: 1965, wikipediaTitle: 'Alphaville (film)',                             tier: 'extended' },
  { tmdbId: 782,    title: 'Gattaca',                                        year: 1997, wikipediaTitle: 'Gattaca',                                       tier: 'extended' },
  { tmdbId: 18491,  title: 'Neon Genesis Evangelion: The End of Evangelion', year: 1997, wikipediaTitle: 'The End of Evangelion',                         tier: 'extended' },
  { tmdbId: 837,    title: 'Videodrome',                                     year: 1983, wikipediaTitle: 'Videodrome',                                    tier: 'extended' },
  { tmdbId: 38,     title: 'Eternal Sunshine of the Spotless Mind',          year: 2004, wikipediaTitle: 'Eternal Sunshine of the Spotless Mind',          tier: 'extended' },
  { tmdbId: 9426,   title: 'The Fly',                                        year: 1986, wikipediaTitle: 'The Fly (1986 film)',                           tier: 'extended' },
  { tmdbId: 2666,   title: 'Dark City',                                      year: 1998, wikipediaTitle: 'Dark City (1998 film)',                         tier: 'extended' },
  { tmdbId: 563,    title: 'Starship Troopers',                              year: 1997, wikipediaTitle: 'Starship Troopers (film)',                      tier: 'extended' },
  { tmdbId: 18,     title: 'The Fifth Element',                              year: 1997, wikipediaTitle: 'The Fifth Element',                             tier: 'extended' },
  { tmdbId: 1892,   title: 'Return of the Jedi',                             year: 1983, wikipediaTitle: 'Return of the Jedi',                           tier: 'extended' },
  { tmdbId: 926,    title: 'Galaxy Quest',                                   year: 1999, wikipediaTitle: 'Galaxy Quest',                                  tier: 'extended' },
  { tmdbId: 5548,   title: 'RoboCop',                                        year: 1987, wikipediaTitle: 'RoboCop (film)',                                tier: 'extended' },
  { tmdbId: 861,    title: 'Total Recall',                                   year: 1990, wikipediaTitle: 'Total Recall (1990 film)',                      tier: 'extended' },
  { tmdbId: 14801,  title: 'Colossus: The Forbin Project',                   year: 1970, wikipediaTitle: 'Colossus: The Forbin Project',                  tier: 'extended' },
  { tmdbId: 10386,  title: 'The Iron Giant',                                 year: 1999, wikipediaTitle: 'The Iron Giant',                               tier: 'extended' },
  { tmdbId: 686,    title: 'Contact',                                        year: 1997, wikipediaTitle: 'Contact (1997 American film)',                               tier: 'extended' },
  { tmdbId: 679,    title: 'Aliens',                                         year: 1986, wikipediaTitle: 'Aliens (film)',                                 tier: 'extended' },
  { tmdbId: 8337,   title: 'They Live',                                      year: 1988, wikipediaTitle: 'They Live',                                    tier: 'extended' },
  { tmdbId: 2756,   title: 'The Abyss',                                      year: 1989, wikipediaTitle: 'The Abyss',                                    tier: 'extended' },
  { tmdbId: 106,    title: 'Predator',                                       year: 1987, wikipediaTitle: 'Predator (film)',                               tier: 'extended' },
  { tmdbId: 165,    title: 'Back to the Future Part II',                     year: 1989, wikipediaTitle: 'Back to the Future Part II',                   tier: 'extended' },
  { tmdbId: 157336, title: 'Interstellar',                                   year: 2014, wikipediaTitle: 'Interstellar (film)',                           tier: 'extended' },
  { tmdbId: 27205,  title: 'Inception',                                      year: 2010, wikipediaTitle: 'Inception',                                    tier: 'extended' },
  { tmdbId: 17431,  title: 'Moon',                                           year: 2009, wikipediaTitle: 'Moon (2009 film)',                              tier: 'extended' },
  { tmdbId: 752,    title: 'V for Vendetta',                                 year: 2006, wikipediaTitle: 'V for Vendetta (film)',                         tier: 'extended' },
  { tmdbId: 19995,  title: 'Avatar',                                         year: 2009, wikipediaTitle: 'Avatar (2009 film)',                            tier: 'extended' },
  { tmdbId: 1103,   title: 'Escape from New York',                           year: 1981, wikipediaTitle: 'Escape from New York',                         tier: 'extended' },
];

// ── External Sources ──────────────────────────────────────────────────────────
//
// Criterion essays, BFI features, Roger Ebert Great Movies.
// Content is fetched via HTTP and HTML-stripped at build time.
// These are NOT enriched by enrich-wikipedia-full.ts — this script handles them.

const EXTERNAL_SOURCES: ExternalSource[] = [
  // Criterion Collection essays
  { tmdbId: 1398,  sourceName: 'criterion',   url: 'https://www.criterion.com/current/posts/4739-stalker-meaning-and-making',                                    label: 'Stalker: Meaning and Making',                              license: 'fair-use' },
  { tmdbId: 68,    sourceName: 'criterion',   url: 'https://www.criterion.com/current/posts/2583-brazil-a-great-place-to-visit-wouldn-t-want-to-live-there',     label: "Brazil: A Great Place to Visit, Wouldn't Want to Live There", license: 'fair-use' },
  { tmdbId: 1428,  sourceName: 'criterion',   url: 'https://www.criterion.com/current/posts/38-alphaville',                                                       label: 'Alphaville',                                               license: 'fair-use' },
  { tmdbId: 662,   sourceName: 'criterion',   url: 'https://www.criterion.com/current/posts/485-la-jetee-unchained-melody',                                       label: 'La Jetée: Unchained Melody',                               license: 'fair-use' },
  { tmdbId: 8338,  sourceName: 'criterion',   url: 'https://www.criterion.com/current/posts/3970-the-manchurian-candidate-dread-center',                          label: 'The Manchurian Candidate: Dread Center',                   license: 'fair-use' },
  { tmdbId: 837,   sourceName: 'criterion',   url: 'https://www.criterion.com/current/posts/337-videodrome-make-mine-cronenberg',                                 label: 'Videodrome: Make Mine Cronenberg',                         license: 'fair-use' },
  // BFI features
  { tmdbId: 78,    sourceName: 'bfi',         url: 'https://www.bfi.org.uk/features/blade-runner',                                                                label: 'Blade Runner: anatomy of a classic',                       license: 'fair-use' },
  { tmdbId: 348,   sourceName: 'bfi',         url: 'https://www.bfi.org.uk/features/alien-40-ridley-scott-sigourney-weaver',                                     label: 'Alien at 40',                                              license: 'fair-use' },
  { tmdbId: 1398,  sourceName: 'bfi',         url: 'https://www.bfi.org.uk/features/andrei-tarkovsky-solaris-stalker',                                           label: 'Andrei Tarkovsky: Solaris and Stalker',                    license: 'fair-use' },
  // Roger Ebert Great Movies
  { tmdbId: 62,    sourceName: 'rogerebert',  url: 'https://www.rogerebert.com/reviews/great-movie-2001-a-space-odyssey-1968',                                   label: '2001: A Space Odyssey — Great Movies',                     license: 'fair-use' },
  { tmdbId: 78,    sourceName: 'rogerebert',  url: 'https://www.rogerebert.com/reviews/great-movie-blade-runner-the-final-cut-1982',                              label: 'Blade Runner: The Final Cut — Great Movies',               license: 'fair-use' },
  { tmdbId: 348,   sourceName: 'rogerebert',  url: 'https://www.rogerebert.com/reviews/great-movie-alien-1979',                                                  label: 'Alien — Great Movies',                                     license: 'fair-use' },
  { tmdbId: 8338,  sourceName: 'rogerebert',  url: 'https://www.rogerebert.com/reviews/great-movie-the-manchurian-candidate-1962',                               label: 'The Manchurian Candidate — Great Movies',                  license: 'fair-use' },
  { tmdbId: 662,   sourceName: 'rogerebert',  url: 'https://www.rogerebert.com/reviews/great-movie-la-jetee-1963',                                               label: 'La Jetée — Great Movies',                                  license: 'fair-use' },
];

// ── Wikipedia full-article fetch (w/api.php — same approach as enrich-wikipedia-full.ts) ──

async function fetchWikipediaFull(title: string): Promise<{ content: string; url: string } | null> {
  const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=true&titles=${encodeURIComponent(title)}&format=json&redirects=true`;
  try {
    const res = await fetch(apiUrl, { headers: { 'User-Agent': 'CinemaCodex/1.0' } });
    if (!res.ok) return null;
    const data = await res.json() as { query?: { pages?: Record<string, { extract?: string; title?: string }> } };
    const pages = data.query?.pages;
    if (!pages) return null;
    const pageId = Object.keys(pages)[0];
    if (!pageId || pageId === '-1') return null;
    const extract = pages[pageId]?.extract;
    if (!extract || extract.length < 100) return null;
    if (extract.includes('may refer to:')) return null;
    return {
      content: extract,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    };
  } catch {
    return null;
  }
}

// ── HTML fetch + strip for external sources ───────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, '\n\n')
    .trim();
}

async function fetchExternalContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CinemaCodex/1.0',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = stripHtml(html);
    if (text.length < 200) return null;
    return text;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const documents: EvidenceDocument[] = [];
  let wikiOk = 0;
  let wikiFail = 0;
  let extOk = 0;
  let extFail = 0;

  // 1. Wikipedia — full article via w/api.php
  console.log(`\nFetching Wikipedia full articles for ${FILMS.length} films...`);
  for (const film of FILMS) {
    process.stdout.write(`  [wiki] ${film.title} (${film.year})... `);
    const result = await fetchWikipediaFull(film.wikipediaTitle);
    if (result) {
      documents.push({
        movieId: `tmdb:${film.tmdbId}`,
        seasonSlug: SEASON_SLUG,
        sourceName: 'wikipedia',
        url: result.url,
        title: film.title,
        content: result.content,
        license: 'CC-BY-SA',
      });
      process.stdout.write(`ok (${result.content.length} chars)\n`);
      wikiOk++;
    } else {
      process.stdout.write('FAILED\n');
      wikiFail++;
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  // 2. External sources — Criterion, BFI, Roger Ebert
  console.log(`\nFetching ${EXTERNAL_SOURCES.length} external sources...`);
  for (const source of EXTERNAL_SOURCES) {
    const film = FILMS.find((f) => f.tmdbId === source.tmdbId);
    const filmTitle = film?.title ?? `tmdb:${source.tmdbId}`;
    process.stdout.write(`  [${source.sourceName}] ${filmTitle} — ${source.label}... `);
    const content = await fetchExternalContent(source.url);
    if (content) {
      documents.push({
        movieId: `tmdb:${source.tmdbId}`,
        seasonSlug: SEASON_SLUG,
        sourceName: source.sourceName,
        url: source.url,
        title: source.label,
        content,
        license: source.license,
      });
      process.stdout.write(`ok (${content.length} chars)\n`);
      extOk++;
    } else {
      process.stdout.write('FAILED\n');
      extFail++;
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  // 3. Write corpus
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const corpus = {
    generatedAt: new Date().toISOString(),
    season: SEASON_SLUG,
    pack: 'sci-fi',
    movieCount: FILMS.length,
    documentCount: documents.length,
    documents,
  };
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');

  console.log(`\nDone.`);
  console.log(`  Wikipedia : ${wikiOk} ok, ${wikiFail} failed`);
  console.log(`  External  : ${extOk} ok, ${extFail} failed`);
  console.log(`  Total docs: ${documents.length}`);
  console.log(`  Output    : ${OUTPUT_PATH}`);
  console.log(`\nNext: npx tsx scripts/ingest-evidence-corpus.ts --input ${OUTPUT_PATH}`);
}

void main().catch((err) => {
  console.error('[build-season3-sci-fi-evidence-corpus] failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
