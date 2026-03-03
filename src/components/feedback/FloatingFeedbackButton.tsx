'use client';

import { useEffect, useState } from 'react';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';

export function FloatingFeedbackButton() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
        });
        if (!active) {
          return;
        }
        setIsAuthed(response.ok);
      } catch {
        if (active) {
          setIsAuthed(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (!isAuthed) {
    return null;
  }

  return (
    <>
      <button
        aria-label="Open feedback"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+92px)] right-[max(12px,calc((100vw-420px)/2+12px))] z-[60] flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(255,255,255,0.18)] bg-[var(--accent)] text-[var(--text)] shadow-[0_10px_22px_rgba(0,0,0,0.45)] transition-colors hover:bg-[var(--accent-strong)]"
        onClick={() => setOpen(true)}
        title="Share feedback"
        type="button"
      >
        <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
          <path d="M8 9h8M8 13h6M5 5h14v11H8l-3 3V5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      </button>
      <FeedbackModal onClose={() => setOpen(false)} open={open} />
    </>
  );
}

