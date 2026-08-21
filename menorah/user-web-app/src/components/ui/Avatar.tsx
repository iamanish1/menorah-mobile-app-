'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { cn, getInitials } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  online?: boolean;
}

const sizes = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

const dotSizes = {
  xs: 'w-1.5 h-1.5 border',
  sm: 'w-2 h-2 border',
  md: 'w-2.5 h-2.5 border',
  lg: 'w-3 h-3 border-2',
  xl: 'w-4 h-4 border-2',
};

export function Avatar({ src, name, size = 'md', className, online }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const initial = getInitials(name).slice(0, 1) || 'U';
  const showImage = Boolean(src) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  return (
    <div className={cn('relative inline-flex shrink-0', sizes[size], className)}>
      {showImage ? (
        <Image
          src={src as string}
          alt={name}
          fill
          className="rounded-full object-cover"
          sizes="80px"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className={cn('rounded-full bg-primary-600 text-white flex items-center justify-center font-bold w-full h-full shadow-sm dark:bg-primary-500')}>
          {initial}
        </div>
      )}
      {online !== undefined && (
        <span className={cn(
          'absolute bottom-0 right-0 rounded-full border-white dark:border-primary-900',
          online ? 'bg-green-500' : 'bg-gray-400',
          dotSizes[size]
        )} />
      )}
    </div>
  );
}
