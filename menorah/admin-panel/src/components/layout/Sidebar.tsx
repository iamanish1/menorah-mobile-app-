'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot, CircleGauge, FileText, LogOut, Menu, SendHorizontal, ShieldCheck, UserRoundCheck, UsersRound, WalletCards, X
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard',   label: 'Dashboard',        icon: CircleGauge    },
  { href: '/counsellors', label: 'Counsellors',       icon: UserRoundCheck },
  { href: '/users',       label: 'Users',             icon: UsersRound     },
  { href: '/ekyc',        label: 'eKYC Reviews',      icon: ShieldCheck    },
  { href: '/revenue',     label: 'Revenue & Payouts', icon: WalletCards    },
  { href: '/payouts',     label: 'Payout History',    icon: SendHorizontal },
  { href: '/articles',    label: 'Articles',          icon: FileText       },
  { href: '/ai-social-studio', label: 'AI Social Studio', icon: Bot         },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-950/20">M</div>
        <div className="min-w-0 overflow-hidden">
          <p className="text-white font-semibold text-sm leading-none">Menorah Health</p>
          <p className="text-slate-400 text-xs mt-0.5">Admin Panel</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              title={label}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200',
                active
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/20'
                  : 'text-slate-400 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon size={19} strokeWidth={1.9} className="flex-shrink-0" />
              <span className="min-w-0 overflow-hidden whitespace-nowrap">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-white/10 px-3 py-4">
        <div className="mb-1 flex items-center gap-3 px-3 py-2">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="min-w-0 overflow-hidden">
            <p className="text-white text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-slate-400 text-xs truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          title="Sign Out"
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-400 transition-colors hover:bg-red-600/20 hover:text-red-400"
        >
          <LogOut size={19} strokeWidth={1.9} className="flex-shrink-0" />
          <span className="min-w-0 overflow-hidden whitespace-nowrap">
            Sign Out
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed left-4 top-4 z-50 rounded-xl bg-slate-900 p-2 text-white shadow-xl lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 w-64 bg-slate-950 transition-transform duration-200 lg:hidden',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <NavContent />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-4 left-4 z-40 hidden w-64 flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-slate-950/25 backdrop-blur-xl lg:flex"
        aria-label="Admin navigation"
      >
        <NavContent />
      </aside>
    </>
  );
}
