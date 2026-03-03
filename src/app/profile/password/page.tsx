'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BottomNav, Button, Card } from '@/components/ui';

export default function ProfilePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !submitting
    && currentPassword.length >= 8
    && newPassword.length >= 8
    && confirmPassword.length >= 8
    && newPassword === confirmPassword
    && currentPassword !== newPassword;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/profile/password', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json().catch(() => ({ error: { message: 'Unable to update password' } }));
      if (!response.ok) {
        setError(payload?.error?.message ?? 'Unable to update password');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password updated successfully.');
    } catch {
      setError('Unable to update password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-16">
      <Card className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Account Security</p>
          <h1 className="mt-2 text-lg font-semibold">Change Password</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Use at least 8 characters. Do not reuse your current password.
          </p>
        </div>
        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--text-muted)]">Current password</span>
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
              minLength={8}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--text-muted)]">New password</span>
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
              minLength={8}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--text-muted)]">Confirm new password</span>
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
              minLength={8}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </label>
          {newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword ? (
            <p className="text-xs text-[var(--danger)]">New password and confirmation must match.</p>
          ) : null}
          {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
          {message ? <p className="text-xs text-[var(--success)]">{message}</p> : null}
          <Button className="w-full" disabled={!canSubmit} type="submit">
            {submitting ? 'Saving...' : 'Update Password'}
          </Button>
        </form>
        <Link className="inline-flex" href="/profile">
          <Button variant="secondary">Back to Profile</Button>
        </Link>
      </Card>

      <BottomNav
        activeId="profile"
        items={[
          { id: 'journey', label: 'Journey', href: '/journey' },
          { id: 'history', label: 'History', href: '/history' },
          { id: 'profile', label: 'Profile', href: '/profile' },
          { id: 'search', label: 'Search', href: '/search' },
        ]}
      />
    </main>
  );
}

