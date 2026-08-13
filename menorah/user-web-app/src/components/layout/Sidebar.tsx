'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Search, CalendarDays, MessageCircle, User,
  Bell, LogOut, Newspaper,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';

const navItems = [
  { href: '/discover',      label: 'Discover',       icon: Search,       tourId: 'discover' },
  { href: '/bookings',      label: 'My Bookings',    icon: CalendarDays, tourId: 'bookings' },
  { href: '/chat',          label: 'Chat',           icon: MessageCircle, tourId: 'chat' },
  { href: '/notifications', label: 'Notifications',  icon: Bell,          tourId: 'notifications' },
  { href: '/learn',         label: 'Articles',       icon: Newspaper,     tourId: 'learn' },
  { href: '/profile',       label: 'Profile',        icon: User,          tourId: 'profile' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();

  return (
    <aside
      aria-label="Primary navigation"
      className={cn(
        'app-sidebar-glass group/sidebar fixed left-4 top-1/2 z-40 hidden max-h-[calc(100dvh-2rem)] w-20 -translate-y-1/2 flex-col overflow-hidden rounded-[2rem] lg:flex',
        'border border-primary-100/80 shadow-[0_28px_80px_-40px_rgba(17,24,39,0.62)] backdrop-blur-2xl',
        'transition-[width,box-shadow] duration-300 ease-out hover:w-[248px] focus-within:w-[248px] will-change-[width]',
        'motion-reduce:transition-none',
        'dark:border-primary-700/70'
      )}
    >
      {/* Logo */}
      <div className="border-b border-primary-100 p-3 dark:border-primary-800">
        <Link
          href="/discover"
          aria-label="Go to Discover"
          className={cn(
            'flex min-h-12 items-center rounded-2xl px-2 text-gray-950 transition-colors hover:bg-primary-50 hover:text-primary-700',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
            'dark:text-primary-50 dark:hover:bg-primary-900 dark:hover:text-primary-100 dark:focus-visible:ring-offset-primary-950'
          )}
        >
          <Image
            src="/menorah-logo.png"
            alt="Menorah logo"
            width={40}
            height={40}
            priority
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
          <span data-sidebar-reveal className="ml-3 whitespace-nowrap text-xl font-black tracking-tight opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
            Menorah
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-3 py-4">
        {navItems.map(({ href, label, icon: Icon, tourId }) => {
          const active = pathname.startsWith(href);
          const isNotif = href === '/notifications';
          const badgeText = unreadCount > 9 ? '9+' : unreadCount;
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              data-tour-id={tourId}
              className={cn(
                'relative flex min-h-12 items-center rounded-2xl px-2 text-sm font-bold transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-primary-950',
                active
                  ? 'bg-primary-600 text-white shadow-[0_10px_28px_-18px_rgba(45,122,92,0.8)] dark:bg-primary-500'
                  : 'text-gray-500 hover:bg-primary-50 hover:text-gray-900 dark:text-primary-100/65 dark:hover:bg-primary-900 dark:hover:text-primary-50'
              )}
            >
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                <Icon
                  aria-hidden="true"
                  className={cn('h-[19px] w-[19px] shrink-0', active ? 'text-white' : 'text-gray-400 dark:text-primary-200/65')}
                />
                {isNotif && unreadCount > 0 && (
                  <span data-sidebar-compact-badge className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white group-hover/sidebar:hidden group-focus-within/sidebar:hidden dark:ring-primary-950">
                    {badgeText}
                  </span>
                )}
              </span>
              <span data-sidebar-reveal className="ml-2 min-w-0 flex-1 whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
                {label}
              </span>
              {isNotif && unreadCount > 0 && (
                <span data-sidebar-reveal className="opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
                  <Badge variant="danger" size="sm">{badgeText}</Badge>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      {user && (
        <div className="space-y-2 border-t border-primary-100 px-3 py-4 dark:border-primary-800">
          <Link
            href="/profile"
            aria-label="Open profile"
            className={cn(
              'flex min-h-12 min-w-0 items-center rounded-2xl px-2 transition-colors hover:bg-primary-50 dark:hover:bg-primary-900',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-primary-950'
            )}
          >
            <Avatar src={user.profileImage} name={`${user.firstName} ${user.lastName}`} size="md" />
            <div data-sidebar-reveal className="ml-3 min-w-0 flex-1 opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
              <p className="truncate text-sm font-bold leading-tight text-gray-950 dark:text-primary-50">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-gray-500 dark:text-primary-100/60 truncate">{user.email}</p>
            </div>
          </Link>
          <div data-tour-id="theme" className="flex min-h-12 items-center rounded-2xl px-2">
            <ThemeToggle className="h-10 w-10 shrink-0" />
            <span data-sidebar-reveal className="ml-3 whitespace-nowrap text-sm font-semibold text-gray-500 opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100 dark:text-primary-100/60">
              Theme
            </span>
          </div>
          <button
            onClick={logout}
            type="button"
            aria-label="Sign out"
            data-tour-id="signout"
            className={cn(
              'flex min-h-12 w-full items-center rounded-2xl px-2 text-sm font-semibold text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:text-primary-100/60 dark:hover:bg-red-950 dark:hover:text-red-200 dark:focus-visible:ring-offset-primary-950'
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <LogOut aria-hidden="true" className="h-[18px] w-[18px]" />
            </span>
            <span data-sidebar-reveal className="ml-2 whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100">
              Sign out
            </span>
          </button>
        </div>
      )}
    </aside>
  );
}
