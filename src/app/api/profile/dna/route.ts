import { fail, ok } from '@/lib/api-envelope';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/guards';
import { TasteComputationService, summarizeTasteProfile } from '@/lib/taste/taste-computation-service';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, prisma);
  if (!auth.ok) {
    return fail(auth.error, auth.status);
  }

  let profile = await prisma.userTasteProfile.findUnique({
    where: { userId: auth.userId },
    select: {
      intensityPreference: true,
      pacingPreference: true,
      psychologicalVsSupernatural: true,
      goreTolerance: true,
      ambiguityTolerance: true,
      nostalgiaBias: true,
      auteurAffinity: true,
      lastComputedAt: true,
    },
  });

  if (!profile) {
    const service = new TasteComputationService(prisma);
    const computed = await service.computeTasteProfile(auth.userId);
    profile = {
      intensityPreference: computed.intensityPreference,
      pacingPreference: computed.pacingPreference,
      psychologicalVsSupernatural: computed.psychologicalVsSupernatural,
      goreTolerance: computed.goreTolerance,
      ambiguityTolerance: computed.ambiguityTolerance,
      nostalgiaBias: computed.nostalgiaBias,
      auteurAffinity: computed.auteurAffinity,
      lastComputedAt: computed.lastComputedAt,
    };
  }

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
  });
}

