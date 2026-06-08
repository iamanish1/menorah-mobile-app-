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
  primary:   'bg-primary-600 hover:bg-primary-700 text-white shadow-[0_12px_24px_-16px_rgba(45,122,92,0.7)] dark:bg-primary-500 dark:hover:bg-primary-400',
  secondary: 'bg-white hover:bg-primary-50 text-gray-800 border border-primary-100 dark:bg-primary-900 dark:hover:bg-primary-800 dark:text-primary-50 dark:border-primary-800',
  ghost:     'bg-transparent hover:bg-primary-50 text-gray-700 dark:hover:bg-primary-900 dark:text-primary-100',
  danger:    'bg-red-600 hover:bg-red-700 text-white shadow-sm',
};

const sizes = {
  sm: 'px-3.5 py-2 text-sm rounded-full min-h-9',
  md: 'px-5 py-2.5 text-sm rounded-full min-h-11',
  lg: 'px-6 py-3.5 text-base rounded-full min-h-12',
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
        'inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
        'dark:focus-visible:ring-offset-primary-950',
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
