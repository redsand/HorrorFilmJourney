import type { HTMLAttributes } from 'react';

type ChipTone = 'default' | 'accent';

type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
};

const toneClasses: Record<ChipTone, string> = {
  default: 'border-[var(--cc-border)] bg-[var(--cc-surface)] text-[var(--cc-text-muted)]',
  accent: 'border-[var(--cc-accent-2)] bg-[var(--cc-glow)] text-[var(--cc-text)]',
};

export function Chip({ tone = 'default', className = '', ...props }: ChipProps) {
  return (
    <span
      {...props}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClasses[tone]} ${className}`.trim()}
    />
  );
}
