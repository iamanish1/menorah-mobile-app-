import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

const variants = {
  default: 'bg-gray-100 text-gray-600 dark:bg-primary-900 dark:text-primary-100',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-50',
  success: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200',
  warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-200',
  danger:  'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200',
  info:    'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
};

const sizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center font-bold rounded-full', variants[variant], sizes[size], className)}>
      {children}
    </span>
  );
}
