import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
}

const variants = {
  primary:   'bg-primary-600 hover:bg-primary-700 text-white shadow-sm',
  secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200',
  ghost:     'bg-transparent hover:bg-gray-100 text-gray-700',
  danger:    'bg-red-600 hover:bg-red-700 text-white shadow-sm',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
};

export function Button({
  variant = 'primary', size = 'md', loading, fullWidth,
  className, children, disabled, ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
        variants[variant], sizes[size],
        fullWidth && 'w-full',
        className
      )}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
