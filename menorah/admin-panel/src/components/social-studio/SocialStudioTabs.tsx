'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClock, CircleGauge, CirclePlus, ClipboardList, Images, Instagram, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/ai-social-studio', label: 'Dashboard', icon: CircleGauge },
  { href: '/ai-social-studio/generate', label: 'Generate', icon: CirclePlus },
  { href: '/ai-social-studio/posts', label: 'Posts', icon: ClipboardList },
  { href: '/ai-social-studio/calendar', label: 'Calendar', icon: CalendarClock },
  { href: '/ai-social-studio/assets', label: 'Assets', icon: Images },
  { href: '/ai-social-studio/settings', label: 'Settings', icon: SlidersHorizontal },
  { href: '/ai-social-studio/instagram', label: 'Instagram', icon: Instagram }
];

export default function SocialStudioTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = href === '/ai-social-studio'
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'inline-flex min-h-10 flex-shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            )}
          >
            <Icon size={15} strokeWidth={1.9} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
