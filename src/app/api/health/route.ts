import { fail, ok } from '@/lib/api-envelope';
import { validateAdminToken } from '@/lib/admin-auth';

export async function GET(request: Request): Promise<Response> {
  const authError = validateAdminToken(request);
  if (authError) {
    return fail(authError, 401);
  }

  return ok({ ok: true }, { status: 200 });
}
