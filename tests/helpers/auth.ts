type AgentRequestInit = Omit<RequestInit, 'headers' | 'body'> & {
  headers?: HeadersInit;
  json?: unknown;
};

export type RequestAgent = (path: string, init?: AgentRequestInit) => Promise<Response>;

type Credentials = {
  email: string;
  password: string;
  displayName?: string;
};

function extractCookieHeader(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('Missing Set-Cookie header in auth response');
  }

  return setCookie.split(';')[0] ?? '';
}

async function parseAuthUser(response: Response): Promise<{ id: string; displayName: string }> {
  const payload = await response.json();
  const user = payload?.data?.user;
  if (!user?.id || !user?.displayName) {
    throw new Error('Auth response missing user payload');
  }
  return { id: user.id as string, displayName: user.displayName as string };
}

export async function signupAndLogin(
  requestAgent: RequestAgent,
  credentials: Credentials,
): Promise<{ cookieHeader: string; user: { id: string; displayName: string } }> {
  const signup = await requestAgent('/api/auth/signup', {
    method: 'POST',
    json: {
      email: credentials.email,
      password: credentials.password,
      displayName: credentials.displayName ?? credentials.email,
    },
  });

  if (signup.status !== 200 && signup.status !== 409) {
    const body = await signup.text();
    throw new Error(`signup failed (${signup.status}): ${body}`);
  }

  return login(requestAgent, credentials);
}

export async function login(
  requestAgent: RequestAgent,
  credentials: Pick<Credentials, 'email' | 'password'>,
): Promise<{ cookieHeader: string; user: { id: string; displayName: string } }> {
  const response = await requestAgent('/api/auth/login', {
    method: 'POST',
    json: {
      email: credentials.email,
      password: credentials.password,
    },
  });

  if (response.status !== 200) {
    const body = await response.text();
    throw new Error(`login failed (${response.status}): ${body}`);
  }

  const cookieHeader = extractCookieHeader(response);
  const user = await parseAuthUser(response);
  return { cookieHeader, user };
}

export async function asAdmin(
  requestAgent: RequestAgent,
): Promise<{ cookieHeader: string; user: { id: string; displayName: string } }> {
  return login(requestAgent, {
    email: process.env.ADMIN_EMAIL ?? 'admin@local.test',
    password: process.env.ADMIN_PASSWORD ?? 'dev-admin-password',
  });
}
