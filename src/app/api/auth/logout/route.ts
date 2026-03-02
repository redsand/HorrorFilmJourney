import { ok } from '@/lib/api-envelope';
import { clearSessionCookie } from '@/lib/auth/session';

export async function POST(): Promise<Response> {
  return ok(
    { success: true },
    {
      status: 200,
      headers: {
        'set-cookie': clearSessionCookie(),
      },
    },
  );
}
