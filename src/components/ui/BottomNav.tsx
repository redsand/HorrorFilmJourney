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
  return (
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-[420px] -translate-x-1/2 border-t border-[var(--border)] bg-[rgba(8,8,10,0.94)] px-3 pb-[calc(env(safe-area-inset-bottom,0)+10px)] pt-2 backdrop-blur">
      <ul className="grid grid-cols-3 gap-2">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-label={item.label}
                className={`flex w-full flex-col items-center justify-center rounded-lg px-2 py-2 text-xs ${
                  active ? 'bg-[rgba(155,17,30,0.24)] text-[var(--text)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
