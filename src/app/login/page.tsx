'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui';

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
          onSubmit={async (event) => {
            event.preventDefault();
            setLoading(true);
            setError(null);
            try {
              const response = await fetch('/api/auth/login', {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email, password }),
              });
              if (!response.ok) {
                const body = await response.json().catch(() => null);
                setError(body?.error?.message ?? 'Login failed');
                return;
              }
              router.push('/');
              router.refresh();
            } finally {
              setLoading(false);
            }
          }}
        >
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2" onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" value={email} />
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2" onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" value={password} />
          {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
          <Button className="w-full" type="submit">{loading ? 'Signing in...' : 'Sign in'}</Button>
        </form>
      </Card>
    </main>
  );
}
