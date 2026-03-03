import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { TasteComputationService, summarizeTasteProfile } from '@/lib/taste/taste-computation-service';
import { resolveEffectivePackForUser } from '@/lib/packs/pack-resolver';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  const effectivePack = await resolveEffectivePackForUser(prisma, auth.userId);
  const service = new TasteComputationService(prisma);
  const profile = await service.computeTasteProfile(auth.userId, {
    packId: effectivePack.packId,
    persist: false,
  });

  const traits = {
    intensityPreference: profile.intensityPreference,
    pacingPreference: profile.pacingPreference,
    psychologicalVsSupernatural: profile.psychologicalVsSupernatural,
    goreTolerance: profile.goreTolerance,
    ambiguityTolerance: profile.ambiguityTolerance,
    nostalgiaBias: profile.nostalgiaBias,
    auteurAffinity: profile.auteurAffinity,
  };

  return ok({
    traits,
    summaryNarrative: summarizeTasteProfile(traits),
    evolution: null,
    lastComputedAt: profile.lastComputedAt.toISOString(),
    packSlug: effectivePack.packSlug,
  });
}
