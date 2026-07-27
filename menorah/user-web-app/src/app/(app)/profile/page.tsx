'use client';

import Link from 'next/link';
import {
  User, MapPin, Phone, Shield, Bell, Lock,
  CreditCard, HeartPulse, ChevronRight, LogOut, ShieldCheck
} from 'lucide-react';
import { Avatar, Badge } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { getSubscriptionBadgeColor } from '@/lib/utils';

const sections = [
  {
    title: 'Account',
    items: [
      { href: '/profile/edit',            icon: User,      label: 'Edit Profile' },
      { href: '/profile/security',        icon: ShieldCheck,label: 'Security & Sign-in' },
      { href: '/profile/change-password', icon: Lock,      label: 'Change Password' },
    ],
  },
  {
    title: 'Preferences',
    items: [
      { href: '/profile/notifications',   icon: Bell,      label: 'Notification Preferences' },
      { href: '/subscription',            icon: CreditCard,label: 'Subscription & Billing' },
    ],
  },
  {
    title: 'Support',
    items: [
      { href: '/profile/crisis-help',     icon: HeartPulse, label: 'Crisis Resources & Help' },
    ],
  },
];

export default function ProfilePage() {
  const { user, logout, logoutAll } = useAuth();
  if (!user) return null;

  const plan = user.subscription?.plan ?? 'free';

  return (
    <div className="page-container max-w-xl">
      {/* User hero */}
      <div className="card p-6 mb-6 flex items-center gap-5 bg-primary-600 text-white dark:bg-primary-900">
        <Avatar src={user.profileImage} name={`${user.firstName} ${user.lastName}`} size="xl" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black text-white">{user.firstName} {user.lastName}</h1>
            <Badge className={getSubscriptionBadgeColor(plan)}>
              {plan.charAt(0).toUpperCase() + plan.slice(1)}
            </Badge>
          </div>
          <p className="text-white/80 text-sm mt-0.5 truncate">{user.email}</p>
          <p className="text-white/65 text-xs mt-0.5">{user.phone}</p>
          <div className="flex gap-2 mt-2">
            {user.isEmailVerified && <Badge variant="success" size="sm">Email verified</Badge>}
            {user.isPhoneVerified && <Badge variant="success" size="sm">Phone verified</Badge>}
          </div>
        </div>
      </div>

      {/* Menu sections */}
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.title} className="card overflow-hidden">
            <div className="px-4 py-2 bg-primary-50 border-b border-primary-100 dark:bg-primary-800 dark:border-primary-700">
              <p className="text-xs font-black text-primary-700 dark:text-primary-100 uppercase tracking-wide">{section.title}</p>
            </div>
            <div className="divide-y divide-primary-50 dark:divide-primary-800">
              {section.items.map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-primary-50 transition-colors group dark:hover:bg-primary-900"
                >
                  <div className="w-8 h-8 bg-primary-50 rounded-2xl flex items-center justify-center shrink-0 dark:bg-primary-800">
                    <Icon className="w-4 h-4 text-primary-600" />
                  </div>
                  <span className="flex-1 text-sm font-bold text-gray-700 group-hover:text-gray-950 dark:text-primary-100 dark:group-hover:text-primary-50">{label}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </Link>
              ))}
            </div>
          </div>
        ))}

        <button
          onClick={() => {
            if (window.confirm('Sign out every browser and device connected to this account?')) {
              void logoutAll();
            }
          }}
          className="w-full card flex items-center gap-3 px-4 py-3.5 text-amber-700 hover:bg-amber-50 transition-colors dark:text-amber-200 dark:hover:bg-amber-950"
        >
          <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-amber-600" />
          </div>
          <span className="flex-1 text-sm font-medium text-left">Sign Out All Devices</span>
        </button>

        <button
          onClick={logout}
          className="w-full card flex items-center gap-3 px-4 py-3.5 text-red-600 hover:bg-red-50 transition-colors dark:text-red-200 dark:hover:bg-red-950"
        >
          <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
            <LogOut className="w-4 h-4 text-red-500" />
          </div>
          <span className="flex-1 text-sm font-medium text-left">Sign Out</span>
        </button>
      </div>

      <p className="text-center text-xs text-gray-400 dark:text-primary-100/45 mt-6">
        Menorah Health v1.0 &nbsp;•&nbsp; &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
