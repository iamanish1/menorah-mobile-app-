import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
  variant?: 'pending' | 'manual_review' | 'approved' | 'rejected' | 'blocked' | 'active' | 'default';
  size?: 'sm' | 'md';
}

const variants = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  manual_review: 'bg-orange-100 text-orange-800 border-orange-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  blocked: 'bg-gray-100 text-gray-600 border-gray-200',
  active: 'bg-blue-100 text-blue-700 border-blue-200',
  default: 'bg-gray-100 text-gray-600 border-gray-200'
};

export default function Badge({ children, variant = 'default', size = 'sm' }: Props) {
  return (
    <span className={cn(
      'inline-flex items-center font-medium border rounded-full capitalize',
      variants[variant],
      size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
    )}>
      {children}
    </span>
  );
}
