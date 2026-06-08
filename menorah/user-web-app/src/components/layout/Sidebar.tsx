'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Search, CalendarDays, MessageCircle, User,
  Bell, CreditCard, HeartPulse, LogOut,
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

  return (
    <aside className="hidden lg:flex flex-col w-72 min-h-screen bg-white/90 border-r border-primary-100 fixed left-0 top-0 bottom-0 z-30 backdrop-blur dark:bg-primary-950/95 dark:border-primary-800">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-primary-100 dark:border-primary-800">
        <Link href="/discover" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl overflow-hidden shrink-0 shadow-sm">
            <img src="/logo.png" alt="Menorah" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-gray-950 dark:text-primary-50 font-black text-sm leading-tight">Menorah</p>
            <p className="text-primary-700/70 dark:text-primary-100/60 text-[11px] font-semibold">Mind Over Matter</p>
          </div>
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
