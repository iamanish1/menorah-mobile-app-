'use client';

import Link from 'next/link';
import {
  User, MapPin, Phone, Shield, Bell, Lock,
  CreditCard, HeartPulse, ChevronRight, LogOut
} from 'lucide-react';
import { Avatar, Badge } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { getSubscriptionBadgeColor } from '@/lib/utils';

const sections = [
  {
    title: 'Account',
    items: [
      { href: '/profile/edit',            icon: User,      label: 'Edit Profile' },
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
  const { user, logout } = useAuth();
  if (!user) return null;

  const plan = user.subscription?.plan ?? 'free';

  return (
    <div className="page-container max-w-xl">
      {/* User hero */}
      <div className="card p-6 mb-6 flex items-center gap-5">
        <Avatar src={user.profileImage} name={`${user.firstName} ${user.lastName}`} size="xl" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{user.firstName} {user.lastName}</h1>
            <Badge className={getSubscriptionBadgeColor(plan)}>
              {plan.charAt(0).toUpperCase() + plan.slice(1)}
            </Badge>
          </div>
          <p className="text-gray-500 text-sm mt-0.5 truncate">{user.email}</p>
          <p className="text-gray-400 text-xs mt-0.5">{user.phone}</p>
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
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{section.title}</p>
            </div>
            <div className="divide-y divide-gray-50">
              {section.items.map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors group"
                >
                  <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary-600" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </Link>
              ))}
            </div>
          </div>
        ))}

        <button
          onClick={logout}
          className="w-full card flex items-center gap-3 px-4 py-3.5 text-red-600 hover:bg-red-50 transition-colors"
        >
          <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
            <LogOut className="w-4 h-4 text-red-500" />
          </div>
          <span className="flex-1 text-sm font-medium text-left">Sign Out</span>
        </button>
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        Menorah Health v1.0 &nbsp;•&nbsp; &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
