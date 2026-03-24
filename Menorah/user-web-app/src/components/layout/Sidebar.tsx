'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Search, CalendarDays, MessageCircle, User,
  Bell, CreditCard, HeartPulse, LogOut, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';

const navItems = [
  { href: '/discover',     label: 'Discover',       icon: Search },
  { href: '/bookings',     label: 'My Bookings',    icon: CalendarDays },
  { href: '/chat',         label: 'Chat',           icon: MessageCircle },
  { href: '/subscription', label: 'Subscription',  icon: CreditCard },
  { href: '/notifications',label: 'Notifications',  icon: Bell },
  { href: '/profile',      label: 'Profile',        icon: User },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();

  return (
    <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-white border-r border-gray-100 fixed left-0 top-0 bottom-0 z-30">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-100">
        <Link href="/discover" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shrink-0">
            <HeartPulse className="w-5 h-5 text-white" />
          </div>
          <span className="text-gray-900 font-semibold text-lg">Menorah</span>
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
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon className={cn('w-5 h-5 shrink-0', active ? 'text-primary-600' : 'text-gray-400')} />
              <span className="flex-1">{label}</span>
              {isNotif && unreadCount > 0 && (
                <Badge variant="danger" size="sm">{unreadCount}</Badge>
              )}
              {active && <ChevronRight className="w-4 h-4 text-primary-400" />}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      {user && (
        <div className="px-3 py-4 border-t border-gray-100 space-y-1">
          <Link href="/profile" className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
            <Avatar src={user.profileImage} name={`${user.firstName} ${user.lastName}`} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
