'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, CalendarDays, MessageCircle, User, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/context/NotificationContext';

const tabs = [
  { href: '/discover',      label: 'Discover',  icon: Search },
  { href: '/bookings',      label: 'Bookings',  icon: CalendarDays },
  { href: '/chat',          label: 'Chat',      icon: MessageCircle },
  { href: '/notifications', label: 'Alerts',    icon: Bell },
  { href: '/profile',       label: 'Profile',   icon: User },
];

export function BottomNav() {
  const pathname      = usePathname();
  const { unreadCount } = useNotifications();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 safe-area-pb">
      <div className="flex items-stretch">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active  = pathname.startsWith(href);
          const isNotif = href === '/notifications';
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center flex-1 min-w-0 pb-2 relative"
            >
              {/* Active bar at the very top of the nav */}
              <span
                className={cn(
                  'absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b-full transition-all duration-200',
                  active ? 'bg-primary-600' : 'bg-transparent'
                )}
              />

              <div className="relative mt-2">
                <Icon
                  className={cn(
                    'w-[22px] h-[22px] transition-colors',
                    active ? 'text-primary-600' : 'text-gray-400'
                  )}
                />
                {isNotif && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px] font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>

              <span
                className={cn(
                  'text-[10px] font-medium mt-0.5 truncate transition-colors',
                  active ? 'text-primary-600' : 'text-gray-400'
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
