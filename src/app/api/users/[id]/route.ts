import { prisma } from '@/lib/prisma';
import { validateAdminToken } from '@/lib/admin-auth';
import { fail, ok } from '@/lib/api-envelope';

type Context = {
  params: {
    id: string;
  };
};

export async function GET(request: Request, context: Context): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: context.params.id },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      profile: {
        select: {
          tolerance: true,
          pacePreference: true,
        },
      },
    },
  });

  if (!user) {
    return fail({ code: 'NOT_FOUND', message: 'User not found' }, 404);
  }

  return ok(user, { status: 200 });
}
