type Grecaptcha = {
  ready: (cb: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};

type WindowWithRecaptcha = Window & {
  grecaptcha?: Grecaptcha;
};

let scriptLoadPromise: Promise<void> | null = null;

function getSiteKey(): string | null {
  const value = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim();
  return value && value.length > 0 ? value : null;
}

function ensureScript(siteKey: string): Promise<void> {
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-recaptcha="google-v3"]');
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.recaptcha = 'google-v3';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load captcha script'));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export async function getCaptchaToken(action: string): Promise<string | null> {
  const siteKey = getSiteKey();
  if (!siteKey || typeof window === 'undefined') {
    return null;
  }

  await ensureScript(siteKey);
  const recaptcha = (window as WindowWithRecaptcha).grecaptcha;
  if (!recaptcha) {
    return null;
  }

  await new Promise<void>((resolve) => {
    recaptcha.ready(() => resolve());
  });

  const token = await recaptcha.execute(siteKey, { action });
  return token || null;
}
