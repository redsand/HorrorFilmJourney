import { prisma } from '../src/lib/prisma.ts';
import { ingestEvidenceDocuments } from '../src/lib/evidence/ingestion/index.ts';

const FIXTURES = [
  {
    tmdbId: 3112,
    slug: 'midnight-movies',
    title: 'Midnight Movies Primer',
    sourceName: 'CinemaCodex Audit (Midnight Movies)',
    content: [
      'Midnight movies are the cult showings that over-index on surreal pacing, taboo subject matter, and audience participation.',
      'The Night of the Hunter belongs in this category because it blends deep anxiety with sermon-like imagery that haunts late-night screenings.',
      'Catalog questions such as “what are midnight movies?” should resolve to these ritualistic selections.',
    ].join(' '),
  },
  {
    tmdbId: 11906,
    slug: 'suspiria-cult',
    title: 'Suspiria Cult Framing',
    sourceName: 'CinemaCodex Audit (Suspiria)',
    content: [
      'Suspiria is a cult film because it rewrites standard horror grammar with operatic color, violent ballet sequences, and exotic production design.',
      'Its cult status comes from the relentless crescendo of dread, the album-cover visuals of Barbara Steele, and the nightly midnight screenings where fans chant the witches’ names.',
      'Users asking “why is Suspiria a cult film?” should get this production-to-reception narrative.',
    ].join(' '),
  },
  {
    tmdbId: 27813,
    slug: 'psychotronic-cinema',
    title: 'Psychotronic Cinema Brief',
    sourceName: 'CinemaCodex Audit (Psychotronic)',
    content: [
      'Psychotronic cinema is defined by its so-bad-it’s-good energy, cheap special effects, and indifferent narrative logic that somehow becomes hypnotic.',
      'Basket Case exemplifies the genre thanks to its gross-out tone, unhinged premise, and cult fan base that reveres it for being unapologetically weird.',
      'Questions about “what defines psychotronic cinema?” should highlight these traits.',
    ].join(' '),
  },
];

async function resolveMovieId(tmdbId: number): Promise<string> {
  const movie = await prisma.movie.findUnique({ where: { tmdbId }, select: { id: true } });
  if (!movie) {
    throw new Error(`Missing movie record for tmdbId ${tmdbId}`);
  }
  return movie.id;
}

async function run(): Promise<void> {
  const documents = [] as Parameters<typeof ingestEvidenceDocuments>[1];
  for (const fixture of FIXTURES) {
    const movieId = await resolveMovieId(fixture.tmdbId);
    documents.push({
      movieId,
      seasonSlug: 'season-2',
      sourceName: fixture.sourceName,
      url: `https://cinemacodex.local/audit/${fixture.slug}`,
      title: fixture.title,
      content: fixture.content,
      license: 'internal',
    });
  }
  const result = await ingestEvidenceDocuments(prisma, documents);
  console.log('[seed-rag-audit-fixtures] ingested', result);
}

run()
  .catch((error) => {
    console.error('[seed-rag-audit-fixtures] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
