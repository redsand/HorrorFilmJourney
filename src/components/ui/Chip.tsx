import type { HTMLAttributes } from 'react';

type ChipTone = 'default' | 'accent';

type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
};

const toneClasses: Record<ChipTone, string> = {
  default: 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]',
  accent: 'border-[rgba(193,18,31,0.55)] bg-[rgba(155,17,30,0.22)] text-[#ffd9dd]',
};

export function Chip({ tone = 'default', className = '', ...props }: ChipProps) {
  return (
    <span
      {...props}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClasses[tone]} ${className}`.trim()}
    />
  );
}
