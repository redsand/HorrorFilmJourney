import { fail, ok } from '@/lib/api-envelope';
import { validateAdminToken } from '@/lib/admin-auth';
import { getCurrentUserId } from '@/lib/request-context';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  const { error } = await getCurrentUserId(request, prisma);
  if (error) {
    return fail(error, 400);
  }

  return ok({ ok: true }, { status: 200 });
}
