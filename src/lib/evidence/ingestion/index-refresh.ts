import { backfillEvidenceChunkEmbeddings } from './embed.ts';

type PrismaEvidenceEmbeddingClient = Parameters<typeof backfillEvidenceChunkEmbeddings>[0];

export async function refreshEvidenceIndex(
  prisma: PrismaEvidenceEmbeddingClient,
  options?: { batchSize?: number; maxRounds?: number },
): Promise<{ rounds: number; scanned: number; updated: number; complete: boolean }> {
  const batchSize = Number.isInteger(options?.batchSize) && (options?.batchSize ?? 0) > 0
    ? Math.min(options!.batchSize!, 5000)
    : 500;
  const maxRounds = Number.isInteger(options?.maxRounds) && (options?.maxRounds ?? 0) > 0
    ? Math.min(options!.maxRounds!, 100_000)
    : 10_000;

  let rounds = 0;
  let scanned = 0;
  let updated = 0;

  while (rounds < maxRounds) {
    const result = await backfillEvidenceChunkEmbeddings(prisma, { batchSize, force: false });
    rounds += 1;
    scanned += result.scanned;
    updated += result.updated;

    if (result.scanned === 0 || result.updated === 0 || result.scanned < batchSize) {
      return {
        rounds,
        scanned,
        updated,
        complete: true,
      };
    }
  }

  return {
    rounds,
    scanned,
    updated,
    complete: false,
  };
}
