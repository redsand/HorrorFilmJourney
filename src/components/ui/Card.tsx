import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`rounded-2xl border border-[var(--border)] bg-[rgba(15,15,18,0.82)] p-4 shadow-[0_12px_34px_rgba(0,0,0,0.45)] backdrop-blur-sm ${className}`.trim()}
    />
  );
}
