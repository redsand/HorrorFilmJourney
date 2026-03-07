'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui';
import { getCaptchaToken } from '@/lib/security/captcha-client';

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    
      <Card className="w-full max-w-sm rounded-2xl border border-[rgba(193,18,31,0.5)] bg-[rgba(8,8,10,0.96)] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
        <h1 className="text-xl font-semibold text-center">Sign up</h1>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setLoading(true);
            setError(null);
            try {
              const captchaToken = await getCaptchaToken('signup');
              const response = await fetch('/api/auth/signup', {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ displayName, email, password, captchaToken }),
              });
              if (!response.ok) {
                const body = await response.json().catch(() => null);
                setError(body?.error?.message ?? 'Signup failed');
                return;
              }
              router.push('/journey');
              router.refresh();
            } finally {
              setLoading(false);
            }
          }}
        >
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2" onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" required type="text" value={displayName} />
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2" onChange={(e) => setEmail(e.target.value)} placeholder="Email" required type="email" value={email} />
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2" minLength={8} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 8)" required type="password" value={password} />
          {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
          <Button className="w-full" type="submit">{loading ? 'Creating account...' : 'Create account'}</Button>
        </form>
      </Card>
    
  );
}
