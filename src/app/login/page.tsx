'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui';
import { getCaptchaToken } from '@/lib/security/captcha-client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">Login</h1>
        <form
          className="mt-4 space-y-3"
          aria-busy={loading}
          onSubmit={async (event) => {
            event.preventDefault();
            setLoading(true);
            setError(null);
            try {
              const captchaToken = await getCaptchaToken('login');
              const response = await fetch('/api/auth/login', {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email, password, captchaToken }),
              });
              if (!response.ok) {
                const body = await response.json().catch(() => null);
                setError(body?.error?.message ?? 'Login failed');
                return;
              }
              router.push('/journey');
              router.refresh();
            } finally {
              setLoading(false);
            }
          }}
        >
          <fieldset className="space-y-3 disabled:opacity-80" disabled={loading}>
            <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2" onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" value={email} />
            <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2" onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" value={password} />
            {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? (
                <>
                  <svg aria-hidden="true" className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" fill="none" opacity="0.3" r="9" stroke="currentColor" strokeWidth="2" />
                    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                  </svg>
                  Signing in...
                </>
              ) : 'Sign in'}
            </Button>
          </fieldset>
        </form>
      </Card>
    </main>
  );
}
