import Image from 'next/image';
import { cn } from '@/lib/utils';

interface SpinnerProps { size?: 'sm' | 'md' | 'lg'; className?: string; }

const sizes = {
  sm: {
    root: 'h-5 w-5',
    logo: 'w-5',
    progress: 'hidden',
  },
  md: {
    root: 'w-20',
    logo: 'w-14',
    progress: 'mt-2 h-0.5 w-16',
  },
  lg: {
    root: 'w-32',
    logo: 'w-24',
    progress: 'mt-3 h-1 w-28',
  },
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const loaderSize = sizes[size];

  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-flex flex-col items-center justify-center align-middle',
        loaderSize.root,
        className
      )}
    >
      <Image
        src="/menorah-loader-logo.png"
        alt=""
        width={900}
        height={835}
        priority={size === 'lg'}
        className={cn('site-loader-logo h-auto object-contain', loaderSize.logo)}
        aria-hidden="true"
      />
      <span className={cn('site-loader-progress block overflow-hidden rounded-full', loaderSize.progress)} aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </span>
  );
}
