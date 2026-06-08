'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useRef } from 'react';
import {
  Search, CalendarDays, MessageCircle, User,
  Bell, CreditCard, LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';

const navItems = [
  { href: '/discover',      label: 'Discover',       icon: Search },
  { href: '/bookings',      label: 'My Bookings',    icon: CalendarDays },
  { href: '/chat',          label: 'Chat',           icon: MessageCircle },
  { href: '/subscription',  label: 'Subscription',   icon: CreditCard },
  { href: '/notifications', label: 'Notifications',  icon: Bell },
  { href: '/profile',       label: 'Profile',        icon: User },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const sidebarRef = useRef<HTMLElement>(null);

  const handleMouseLeave = useCallback(() => {
    const activeElement = document.activeElement;

    if (activeElement instanceof HTMLElement && sidebarRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
  }, []);

  return (
    <aside
      ref={sidebarRef}
      aria-label="Primary navigation"
      onMouseLeave={handleMouseLeave}
      className={cn(
        'group/sidebar hidden lg:flex fixed left-0 top-0 bottom-0 z-40 min-h-screen w-72 flex-col',
        'border-r border-primary-100 bg-white/95 shadow-[0_22px_60px_-34px_rgba(17,24,39,0.55)] backdrop-blur-xl',
        'transition-transform duration-300 ease-out will-change-transform',
        '-translate-x-[calc(100%_-_1.15rem)] hover:translate-x-0 focus-within:translate-x-0 motion-reduce:transition-none',
        'dark:border-primary-800 dark:bg-primary-950/95'
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-6 right-0 top-6 w-[1.15rem] rounded-r-2xl border-y border-r border-primary-100 bg-gradient-to-b from-primary-600 via-primary-500 to-primary-700 shadow-[10px_0_30px_-20px_rgba(45,122,92,0.85)] transition-opacity duration-200 group-hover/sidebar:opacity-0 group-focus-within/sidebar:opacity-0 dark:border-primary-700"
      />
      {/* Logo */}
      <div className="px-6 py-5 border-b border-primary-100 dark:border-primary-800">
        <Link
          href="/discover"
          className="flex min-h-12 items-center gap-3 text-2xl font-semibold tracking-tight text-gray-950 transition-colors hover:text-primary-700 dark:text-primary-50 dark:hover:text-primary-100"
        >
          <Image
            src="/menorah-logo.png"
            alt="Menorah logo"
            width={48}
            height={48}
            priority
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
          <span>Menorah</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          const isNotif = href === '/notifications';
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3.5 py-3 text-sm font-bold transition-colors duration-150 rounded-2xl',
                active
                  ? 'bg-primary-600 text-white shadow-[0_10px_28px_-18px_rgba(45,122,92,0.8)] dark:bg-primary-500'
                  : 'text-gray-500 hover:bg-primary-50 hover:text-gray-900 dark:text-primary-100/65 dark:hover:bg-primary-900 dark:hover:text-primary-50'
              )}
            >
              <Icon className={cn('w-[18px] h-[18px] shrink-0', active ? 'text-white' : 'text-gray-400 dark:text-primary-200/65')} />
              <span className="flex-1">{label}</span>
              {isNotif && unreadCount > 0 && (
                <Badge variant="danger" size="sm">{unreadCount > 9 ? '9+' : unreadCount}</Badge>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      {user && (
        <div className="px-3 py-4 border-t border-primary-100 dark:border-primary-800 space-y-2">
          <div className="flex items-center justify-between rounded-3xl bg-primary-50/70 p-2 dark:bg-primary-900/80">
          <Link
            href="/profile"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/80 transition-colors dark:hover:bg-primary-800/70"
          >
            <Avatar src={user.profileImage} name={`${user.firstName} ${user.lastName}`} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-950 dark:text-primary-50 truncate leading-tight">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-gray-500 dark:text-primary-100/60 truncate">{user.email}</p>
            </div>
          </Link>
          <ThemeToggle className="h-10 w-10 shrink-0" />
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors dark:text-primary-100/60 dark:hover:bg-red-950 dark:hover:text-red-200"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
