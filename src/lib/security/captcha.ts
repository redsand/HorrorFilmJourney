import type { ApiError } from '@/lib/api-envelope';

type CaptchaValidationResult =
  | { ok: true }
  | { ok: false; status: 400 | 500; error: ApiError };

type VerifyCaptchaInput = {
  token: string | null | undefined;
  request: Request;
  expectedAction: string;
};

type GoogleCaptchaResponse = {
  success?: boolean;
  score?: number;
  action?: string;
};

function captchaEnabled(): boolean {
  return process.env.CAPTCHA_ENABLED === 'true';
}

function minimumScore(): number {
  const configured = Number(process.env.RECAPTCHA_MIN_SCORE ?? '0.5');
  if (!Number.isFinite(configured)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, configured));
}

function resolveClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (!forwardedFor) {
    return null;
  }
  const first = forwardedFor.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export async function verifyCaptchaToken(input: VerifyCaptchaInput): Promise<CaptchaValidationResult> {
  if (!captchaEnabled()) {
    return { ok: true };
  }

  const token = input.token?.trim();
  if (!token) {
    return {
      ok: false,
      status: 400,
      error: { code: 'CAPTCHA_REQUIRED', message: 'Captcha verification is required' },
    };
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  if (!secret) {
    return {
      ok: false,
      status: 500,
      error: { code: 'CAPTCHA_MISCONFIGURED', message: 'Captcha is not configured on the server' },
    };
  }

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  const remoteIp = resolveClientIp(input.request);
  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  let payload: GoogleCaptchaResponse | null = null;
  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    payload = (await response.json()) as GoogleCaptchaResponse;
  } catch {
    return {
      ok: false,
      status: 500,
      error: { code: 'CAPTCHA_VERIFY_FAILED', message: 'Captcha verification failed' },
    };
  }

  if (!payload?.success) {
    return {
      ok: false,
      status: 400,
      error: { code: 'CAPTCHA_INVALID', message: 'Captcha validation failed' },
    };
  }

  if (typeof payload.action === 'string' && payload.action !== input.expectedAction) {
    return {
      ok: false,
      status: 400,
      error: { code: 'CAPTCHA_INVALID', message: 'Captcha action mismatch' },
    };
  }

  if (typeof payload.score === 'number' && payload.score < minimumScore()) {
    return {
      ok: false,
      status: 400,
      error: { code: 'CAPTCHA_INVALID', message: 'Captcha score too low' },
    };
  }

  return { ok: true };
}
