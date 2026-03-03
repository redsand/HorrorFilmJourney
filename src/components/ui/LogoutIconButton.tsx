'use client';

import { useRouter } from 'next/navigation';

export function LogoutIconButton() {
  const router = useRouter();

  return (
    <button
      aria-label="Logout"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--cc-border)] bg-[var(--cc-surface)] text-[var(--cc-text)] hover:border-[var(--cc-accent-2)] hover:text-[var(--cc-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cc-focus)]"
      onClick={async () => {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
        router.push('/login');
        router.refresh();
      }}
      title="Logout"
      type="button"
    >
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        viewBox="0 0 24 24"
        width="18"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M10 12h10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="m17 8 4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    </button>
  );
}
