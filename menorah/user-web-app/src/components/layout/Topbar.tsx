'use client';

import Link from 'next/link';
import { Bell, Newspaper } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';

export function Topbar() {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();

  if (!user) return null;

  return (
    <header className="lg:hidden bg-primary-50/95 border-b border-primary-100 px-4 py-3 flex items-center justify-between sticky top-0 z-20 backdrop-blur dark:bg-primary-950/95 dark:border-primary-800">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-2xl overflow-hidden shadow-sm">
          <img src="/logo.png" alt="Menorah" className="w-full h-full object-cover" />
        </div>
        <div>
          <span className="block font-black text-gray-950 leading-tight dark:text-primary-50">Menorah</span>
          <span className="block text-[10px] font-semibold text-primary-700/70 dark:text-primary-100/60">Mind Over Matter</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle className="h-10 w-10" />
        <Link href="/learn" className="relative p-2.5 rounded-full bg-white text-gray-700 shadow-sm hover:bg-primary-100 transition-colors dark:bg-primary-900 dark:text-primary-100 dark:hover:bg-primary-800" aria-label="Open articles">
          <Newspaper className="w-5 h-5" />
        </Link>
        <Link href="/notifications" className="relative p-2.5 rounded-full bg-white text-gray-700 shadow-sm hover:bg-primary-100 transition-colors dark:bg-primary-900 dark:text-primary-100 dark:hover:bg-primary-800">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
        <Link href="/profile">
          <Avatar src={user.profileImage} name={`${user.firstName} ${user.lastName}`} size="sm" />
        </Link>
      </div>
    </header>
  );
}
