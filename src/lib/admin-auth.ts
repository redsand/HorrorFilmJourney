import { fail, type ApiError } from '@/lib/api-envelope';
import { requireAdmin } from '@/lib/auth/guards';

export async function validateAdminToken(request: Request): Promise<{ error: ApiError | null; status: 401 | 403 | null }> {
  const result = await requireAdmin(request);
  if (result.ok) {
    return { error: null, status: null };
  }
  return { error: result.error, status: result.status };
}

export function unauthorizedResponse(): Response {
  return fail({ code: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
}
