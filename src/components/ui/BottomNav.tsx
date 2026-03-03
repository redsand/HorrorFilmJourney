import type { ReactNode } from 'react';
import Link from 'next/link';

type BottomNavItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  href: string;
};

type BottomNavProps = {
  items: BottomNavItem[];
  activeId: string;
};

export function BottomNav({ items, activeId }: BottomNavProps) {
  const defaultIconById: Record<string, ReactNode> = {
    journey: (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path d="M4 19V5l16 7-16 7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    ),
    history: (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path d="M12 8v5l3 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    profile: (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 20c.8-3 3.6-5 7-5s6.2 2 7 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    ),
    search: (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
        <path d="m20 20-3.5-3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    ),
  };

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-[420px] -translate-x-1/2 border-t border-[var(--cc-border)] bg-[color:var(--cc-surface)] px-3 pb-[calc(env(safe-area-inset-bottom,0)+10px)] pt-2 backdrop-blur">
      <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = item.id === activeId;
          const icon = item.icon ?? defaultIconById[item.id];
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-label={item.label}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs ${
                  active ? 'bg-[var(--cc-glow)] text-[var(--cc-text)]' : 'text-[var(--cc-text-muted)]'
                }`}
              >
                {icon}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
