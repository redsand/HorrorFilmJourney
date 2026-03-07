import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const searches = ['Flash Gordon', 'Sorry to Bother', 'The Road', 'Man in the High Castle', 'Hugo'];
  for (const s of searches) {
    const r = await p.movie.findMany({ where: { title: { contains: s, mode: 'insensitive' } }, select: { tmdbId: true, title: true, year: true }, take: 6 });
    console.log(s + ':');
    for (const m of r) console.log(`  tmdb:${m.tmdbId} | ${m.title} (${m.year})`);
  }
}
main().catch(e => console.error(e.message)).finally(() => p.$disconnect());
