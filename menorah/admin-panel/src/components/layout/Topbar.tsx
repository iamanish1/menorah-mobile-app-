'use client';

import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/counsellors': 'Counsellors',
  '/users': 'Users',
  '/sessions': 'Sessions',
  '/revenue': 'Revenue & Payouts',
  '/payouts': 'Payout History',
  '/articles': 'Articles',
  '/ai-social-studio': 'AI Social Studio',
  '/server-usage': 'Server Usage'
};

export default function Topbar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const title = Object.entries(titles).find(([key]) => pathname === key || pathname.startsWith(key + '/'))?.[1] || 'Admin';

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-30">
      <h1 className="text-lg font-semibold text-gray-900 ml-10 lg:ml-0">{title}</h1>
      <div className="flex items-center gap-4">
        <button className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
          <Bell size={20} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <span className="text-sm font-medium text-gray-700 hidden sm:block">{user?.firstName} {user?.lastName}</span>
        </div>
      </div>
    </header>
  );
}
