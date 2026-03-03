'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Chip, LogoutIconButton } from '@/components/ui';

type UserRow = {
  id: string;
  displayName: string;
  email: string | null;
  role: 'ADMIN' | 'USER';
};

export default function AdminUsersPage() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const adminCount = useMemo(() => users.filter((user) => user.role === 'ADMIN').length, [users]);

  async function loadUsers(search = ''): Promise<void> {
    setLoading(true);
    const response = await fetch(`/api/users${search ? `?q=${encodeURIComponent(search)}` : ''}`, {
      method: 'GET',
      credentials: 'include',
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload?.error?.message ?? 'Failed to load users');
      setUsers([]);
      setLoading(false);
      return;
    }
    setUsers(payload.data as UserRow[]);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  return (
    <main className="flex flex-1 flex-col gap-4 pb-24 pt-20">
      <header className="fixed left-1/2 top-0 z-40 w-full max-w-[420px] -translate-x-1/2 border-b border-[var(--border)] bg-[rgba(8,8,10,0.92)] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Horror Codex</h1>
            <p className="text-xs text-[var(--text-muted)]">Admin · Users</p>
          </div>
          <LogoutIconButton />
        </div>
      </header>

      <Card className="space-y-3">
        <p className="text-sm text-[var(--text-muted)]">
          Safety: last admin cannot be demoted.
        </p>
        <div className="flex gap-2">
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by display name"
            value={query}
          />
          <Button onClick={() => void loadUsers(query)} type="button" variant="secondary">Search</Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Create user</h2>
        <AdminCreateForm
          onCreated={async () => {
            await loadUsers(query);
          }}
        />
      </Card>

      <Card className="space-y-2">
        <h2 className="text-lg font-semibold">Users ({users.length})</h2>
        {loading ? <p className="text-sm text-[var(--text-muted)]">Loading...</p> : null}
        {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
        {users.map((user) => (
          <div className="rounded-lg border border-[var(--border)] p-3" key={user.id}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{user.displayName}</p>
                <p className="text-xs text-[var(--text-muted)]">{user.email ?? 'No email'}</p>
              </div>
              <Chip tone={user.role === 'ADMIN' ? 'accent' : 'default'}>{user.role}</Chip>
            </div>
            <Button
              className="mt-2"
              onClick={() => setEditing(user)}
              type="button"
              variant="secondary"
            >
              Edit
            </Button>
          </div>
        ))}
      </Card>

      {editing ? (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Edit user</h2>
          <AdminEditForm
            adminCount={adminCount}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await loadUsers(query);
            }}
            user={editing}
          />
        </Card>
      ) : null}
    </main>
  );
}

function AdminCreateForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch('/api/users', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            displayName,
            email: email || undefined,
            password: password || undefined,
            isAdmin,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          setError(payload?.error?.message ?? 'Create failed');
          return;
        }
        setDisplayName('');
        setEmail('');
        setPassword('');
        setIsAdmin(false);
        setError(null);
        await onCreated();
      }}
    >
      <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm" onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" required value={displayName} />
      <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm" onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" type="email" value={email} />
      <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm" minLength={8} onChange={(e) => setPassword(e.target.value)} placeholder="Password (optional, min 8)" type="password" value={password} />
      <label className="flex items-center gap-2 text-sm">
        <input checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} type="checkbox" />
        Admin role
      </label>
      {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
      <Button type="submit">Create user</Button>
    </form>
  );
}

function AdminEditForm({
  user,
  adminCount,
  onCancel,
  onSaved,
}: {
  user: UserRow;
  adminCount: number;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email ?? '');
  const [role, setRole] = useState<'ADMIN' | 'USER'>(user.role);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const demoteBlocked = user.role === 'ADMIN' && adminCount <= 1;

  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch(`/api/users/${user.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            displayName,
            email,
            role,
            password: password || undefined,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          setError(payload?.error?.message ?? 'Update failed');
          return;
        }
        setError(null);
        await onSaved();
      }}
    >
      <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm" onChange={(e) => setDisplayName(e.target.value)} value={displayName} />
      <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm" onChange={(e) => setEmail(e.target.value)} type="email" value={email} />
      <select
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
        disabled={demoteBlocked}
        onChange={(e) => setRole(e.target.value as 'ADMIN' | 'USER')}
        value={role}
      >
        <option value="USER">USER</option>
        <option value="ADMIN">ADMIN</option>
      </select>
      {demoteBlocked ? <p className="text-xs text-[var(--text-muted)]">Cannot demote last admin.</p> : null}
      <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm" minLength={8} onChange={(e) => setPassword(e.target.value)} placeholder="New password (optional)" type="password" value={password} />
      {error ? <p className="text-sm text-[var(--accent)]">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit">Save</Button>
        <Button onClick={onCancel} type="button" variant="secondary">Cancel</Button>
      </div>
    </form>
  );
}
