'use client';

import Link from 'next/link';
import { Bell, Menu } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';

export function Topbar() {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();

  if (!user) return null;

  return (
    <header className="lg:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
          <span className="text-white text-sm font-bold">M</span>
        </div>
        <span className="font-semibold text-gray-900">Menorah</span>
      </div>

      <div className="flex items-center gap-3">
        <Link href="/notifications" className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <Bell className="w-5 h-5 text-gray-600" />
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
