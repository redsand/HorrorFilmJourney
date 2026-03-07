import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const validSlugs = [
  'proto-science-fiction',
  'atomic-age-science-fiction',
  'cold-war-paranoia',
  'space-race-cinema',
  'new-hollywood-science-fiction',
  'philosophical-science-fiction',
  'blockbuster-science-fiction',
  'cyberpunk',
  'ai-cinema',
  'alien-encounter',
  'time-travel',
  'modern-speculative'
];

async function main() {
  const pack = await prisma.genrePack.findUnique({ where: { slug: 'sci-fi' } });
  if (!pack) throw new Error('Pack not found');

  const nodes = await prisma.journeyNode.findMany({
    where: { packId: pack.id }
  });

  const toDelete = nodes.filter(n => !validSlugs.includes(n.slug));
  console.log(`Found ${nodes.length} nodes total, ${toDelete.length} to delete`);

  for (const n of toDelete) {
    await prisma.journeyNode.delete({ where: { id: n.id } });
    console.log(`Deleted ${n.slug}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
