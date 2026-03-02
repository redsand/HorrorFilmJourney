import { fail, ok } from '@/lib/api-envelope';
import { validateAdminToken } from '@/lib/admin-auth';

export async function GET(request: Request): Promise<Response> {
  const auth = await validateAdminToken(request);
  if (auth.error) {
    return fail(auth.error, auth.status ?? 401);
  }

  return ok({ ok: true }, { status: 200 });
}
