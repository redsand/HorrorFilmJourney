type Envelope<T> = { data: T | null; error: { code: string; message: string } | null };

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  cookie?: string | null;
};

function env(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

async function requestJson<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<{ status: number; body: Envelope<T>; cookie: string | null }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const body = (await response.json()) as Envelope<T>;
  const setCookie = response.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] ?? null : null;
  return { status: response.status, body, cookie };
}

async function main(): Promise<void> {
  const baseUrl = env('SMOKE_BASE_URL').replace(/\/+$/, '');
  const email = env('SMOKE_EMAIL');
  const password = env('SMOKE_PASSWORD');
  const displayName = optionalEnv('SMOKE_DISPLAY_NAME') ?? 'Smoke User';
  const captchaToken = optionalEnv('SMOKE_CAPTCHA_TOKEN');

  let cookie = optionalEnv('SMOKE_COOKIE_HEADER');

  if (!cookie) {
    const signup = await requestJson<{ user: { id: string } }>(baseUrl, '/api/auth/signup', {
      method: 'POST',
      body: { email, password, displayName, ...(captchaToken ? { captchaToken } : {}) },
    });

    if (signup.status === 200) {
      cookie = signup.cookie;
    } else {
      const login = await requestJson<{ user: { id: string } }>(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email, password, ...(captchaToken ? { captchaToken } : {}) },
      });
      if (login.status !== 200) {
        throw new Error(`Auth failed: ${login.status} ${JSON.stringify(login.body.error)}`);
      }
      cookie = login.cookie;
    }
  }

  if (!cookie) {
    throw new Error('No session cookie acquired for smoke test');
  }

  const experience = await requestJson<{ state: string; packSelection?: { packs: Array<{ slug: string; isEnabled: boolean }> } }>(baseUrl, '/api/experience', {
    cookie,
  });
  if (experience.status !== 200 || !experience.body.data) {
    throw new Error(`Experience failed: ${experience.status}`);
  }

  if (experience.body.data.state === 'PACK_SELECTION_NEEDED') {
    const enabledPack = experience.body.data.packSelection?.packs.find((pack) => pack.isEnabled)?.slug ?? 'horror';
    const selectPack = await requestJson<{ success: boolean }>(baseUrl, '/api/profile/select-pack', {
      method: 'POST',
      cookie,
      body: { packSlug: enabledPack },
    });
    if (selectPack.status !== 200) {
      throw new Error(`Pack selection failed: ${selectPack.status}`);
    }
  }

  const onboarding = await requestJson<{ success: boolean }>(baseUrl, '/api/onboarding', {
    method: 'POST',
    cookie,
    body: { tolerance: 3, pacePreference: 'balanced' },
  });
  if (onboarding.status !== 200 && onboarding.status !== 400) {
    throw new Error(`Onboarding unexpected status: ${onboarding.status}`);
  }

  const recommendations = await requestJson<{ batchId: string; cards: Array<{ movie: { tmdbId: number } }>; interactionContext?: Array<{ tmdbId: number; recommendationItemId: string }> }>(
    baseUrl,
    '/api/recommendations/next',
    { method: 'POST', cookie },
  );
  if (recommendations.status !== 200 || !recommendations.body.data || recommendations.body.data.cards.length === 0) {
    throw new Error(`Recommendations failed: ${recommendations.status}`);
  }

  const card = recommendations.body.data.cards[0];
  const interactionContext = recommendations.body.data.interactionContext?.find((item) => item.tmdbId === card.movie.tmdbId);
  const interaction = await requestJson<{ interaction: { id: string } }>(baseUrl, '/api/interactions', {
    method: 'POST',
    cookie,
    body: {
      tmdbId: card.movie.tmdbId,
      status: 'WATCHED',
      rating: 4,
      recommendationItemId: interactionContext?.recommendationItemId,
    },
  });
  if (interaction.status !== 200) {
    throw new Error(`Interaction failed: ${interaction.status}`);
  }

  const history = await requestJson<{ items: Array<{ interactionId: string }> }>(baseUrl, '/api/history', { cookie });
  if (history.status !== 200 || !history.body.data || history.body.data.items.length === 0) {
    throw new Error(`History failed: ${history.status}`);
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    recommendationCount: recommendations.body.data.cards.length,
    historyCount: history.body.data.items.length,
  }));
}

main().catch((error) => {
  console.error('[smoke-prod] failed', error instanceof Error ? error.message : error);
  process.exit(1);
});
