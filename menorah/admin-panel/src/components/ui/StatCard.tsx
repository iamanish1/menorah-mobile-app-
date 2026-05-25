import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'amber' | 'purple' | 'red';
  trend?: { value: number; label: string };
}

const colorMap = {
  blue: { bg: 'bg-blue-50', icon: 'bg-blue-600 text-white', text: 'text-blue-600' },
  green: { bg: 'bg-green-50', icon: 'bg-green-600 text-white', text: 'text-green-600' },
  amber: { bg: 'bg-amber-50', icon: 'bg-amber-500 text-white', text: 'text-amber-600' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-600 text-white', text: 'text-purple-600' },
  red: { bg: 'bg-red-50', icon: 'bg-red-500 text-white', text: 'text-red-600' }
};

export default function StatCard({ title, value, subtitle, icon: Icon, color = 'blue', trend }: Props) {
  const colors = colorMap[color];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', colors.icon)}>
        <Icon size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        {trend && (
          <p className={cn('text-xs mt-1 font-medium', trend.value >= 0 ? 'text-green-600' : 'text-red-500')}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
          </p>
        )}
      </div>
    </div>
  );
}
