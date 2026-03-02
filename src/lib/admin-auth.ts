import { fail, type ApiError } from '@/lib/api-envelope';

function getAdminToken(): string {
  return process.env.ADMIN_TOKEN ?? 'dev-admin-token';
}

export function validateAdminToken(request: Request): ApiError | null {
  const token = request.headers.get('x-admin-token');
  if (!token || token !== getAdminToken()) {
    return {
      code: 'UNAUTHORIZED',
      message: 'Invalid admin token',
    };
  }

  return null;
}

export function unauthorizedResponse(): Response {
  return fail({ code: 'UNAUTHORIZED', message: 'Invalid admin token' }, 401);
}
