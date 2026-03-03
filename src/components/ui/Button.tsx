import React from 'react';
import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cc-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cc-bg)] disabled:cursor-not-allowed disabled:opacity-50';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--cc-accent)] text-[var(--cc-text)] hover:bg-[var(--cc-accent-2)] shadow-[0_0_0_1px_var(--cc-glow)]',
  secondary: 'border border-[var(--cc-border)] bg-[var(--cc-surface)] text-[var(--cc-text)] hover:bg-[var(--cc-surface-2)]',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`.trim()}
    />
  );
}
