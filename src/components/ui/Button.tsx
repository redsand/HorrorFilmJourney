import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const baseClasses =
  'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--accent)] text-[var(--text)] hover:bg-[var(--accent-strong)]',
  secondary: 'border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] hover:bg-[#151518]',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`.trim()}
    />
  );
}
