import { prisma } from '../src/lib/prisma.ts';

async function run(): Promise<void> {
  const packets = await prisma.evidencePacket.count();
  const documents = await prisma.evidenceDocument.count();
  const chunks = await prisma.evidenceChunk.count();
  console.log(JSON.stringify({ packets, documents, chunks }, null, 2));
}

run()
  .catch((error) => {
    console.error('[log-evidence-counts] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
