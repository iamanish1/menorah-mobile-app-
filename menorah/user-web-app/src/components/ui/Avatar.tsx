import Image from 'next/image';
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
  return (
    <div className={cn('relative inline-flex shrink-0', sizes[size], className)}>
      {src ? (
        <Image
          src={src}
          alt={name}
          fill
          className="rounded-full object-cover"
          sizes="80px"
        />
      ) : (
        <div className={cn('rounded-full bg-primary-600 text-white flex items-center justify-center font-semibold w-full h-full')}>
          {getInitials(name)}
        </div>
      )}
      {online !== undefined && (
        <span className={cn(
          'absolute bottom-0 right-0 rounded-full border-white',
          online ? 'bg-green-500' : 'bg-gray-400',
          dotSizes[size]
        )} />
      )}
    </div>
  );
}
