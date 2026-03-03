import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`rounded-2xl border border-[var(--cc-border)] bg-[color:var(--cc-surface)] p-4 shadow-[0_12px_34px_var(--cc-shadow)] backdrop-blur-sm ${className}`.trim()}
    />
  );
}
