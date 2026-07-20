import React from 'react';
import { Loader2 } from 'lucide-react';
import './Button.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 变体：primary / glass / ghost / danger；'secondary' 为旧名别名，等价于 'glass' */
  variant?: 'primary' | 'glass' | 'ghost' | 'danger' | 'secondary';
  /** 尺寸：sm 36px / md 44px / lg 52px */
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  const resolvedVariant = variant === 'secondary' ? 'glass' : variant;
  const classNames = [
    'btn',
    `btn--${resolvedVariant}`,
    `btn--${size}`,
    loading ? 'btn--loading' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={classNames}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <Loader2 className="btn__spinner" size={16} strokeWidth={1.75} aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
