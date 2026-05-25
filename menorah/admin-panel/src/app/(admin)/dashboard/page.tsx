'use client';

import { useEffect, useState } from 'react';
import {
  Users, UserCheck, CalendarCheck, IndianRupee, Clock, TrendingUp, Activity
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import StatCard from '@/components/ui/StatCard';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { PlatformStats, RevenueData } from '@/types';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getStats(), api.getRevenue()]).then(([s, r]) => {
      if (s.success && s.data) setStats(s.data);
      if (r.success && r.data) setRevenue(r.data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-28 animate-pulse">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-xl" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 bg-gray-100 rounded w-20" />
                  <div className="h-7 bg-gray-100 rounded w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const dailyData = revenue?.dailyTrend?.slice(-14) || [];
  const monthlyData = revenue?.monthlyTrend || [];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={stats?.users.total.toLocaleString() || '0'}
          subtitle={`+${stats?.users.newToday || 0} today`}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Approved Counsellors"
          value={stats?.counsellors.approved || 0}
          subtitle={`${stats?.counsellors.pending || 0} pending review`}
          icon={UserCheck}
          color="green"
        />
        <StatCard
          title="Total Bookings"
          value={stats?.bookings.total.toLocaleString() || '0'}
          subtitle={`${stats?.bookings.active || 0} active now`}
          icon={CalendarCheck}
          color="purple"
        />
        <StatCard
          title="Revenue Today"
          value={formatCurrency(stats?.revenue.today || 0)}
          subtitle={`${formatCurrency(stats?.revenue.monthly || 0)} this month`}
          icon={IndianRupee}
          color="amber"
        />
      </div>

      {/* Secondary stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Pending Approvals', value: stats?.counsellors.pending || 0, href: '/counsellors?status=pending', color: 'text-amber-600 bg-amber-50', icon: Clock },
          { label: 'Blocked Counsellors', value: stats?.counsellors.blocked || 0, href: '/counsellors?status=blocked', color: 'text-red-600 bg-red-50', icon: Activity },
          { label: 'Sessions Today', value: stats?.bookings.today || 0, href: '/counsellors', color: 'text-blue-600 bg-blue-50', icon: TrendingUp },
          { label: 'Weekly Revenue', value: formatCurrency(stats?.revenue.weekly || 0), href: '/revenue', color: 'text-green-600 bg-green-50', icon: IndianRupee }
        ].map((item) => (
          <Link key={item.label} href={item.href}
            className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}>
              <item.icon size={16} />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">{item.label}</p>
              <p className="text-lg font-bold text-gray-900">{item.value}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Daily Revenue (last 14 days) */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Daily Revenue</h3>
              <p className="text-xs text-gray-500 mt-0.5">Last 14 days</p>
            </div>
            <Link href="/revenue" className="text-xs text-blue-600 hover:underline">View all →</Link>
          </div>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={dailyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} labelFormatter={(l) => formatDate(l)} />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#revenueGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">No revenue data yet</div>
          )}
        </div>

        {/* Monthly Revenue */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Monthly Revenue</h3>
              <p className="text-xs text-gray-500 mt-0.5">Last 12 months</p>
            </div>
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              {formatCurrency(revenue?.summary.yearly.revenue || 0)} YTD
            </span>
          </div>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">No revenue data yet</div>
          )}
        </div>
      </div>

      {/* Quick action cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/counsellors?status=pending"
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 hover:bg-amber-100 transition-colors group">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-800">Pending Approvals</p>
              <p className="text-3xl font-bold text-amber-600 mt-1">{stats?.counsellors.pending || 0}</p>
              <p className="text-xs text-amber-600 mt-1">counsellors awaiting review</p>
            </div>
            <Clock size={24} className="text-amber-500 group-hover:scale-110 transition-transform" />
          </div>
        </Link>

        <Link href="/revenue"
          className="bg-green-50 border border-green-200 rounded-xl p-5 hover:bg-green-100 transition-colors group">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-green-800">Monthly Revenue</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{formatCurrency(stats?.revenue.monthly || 0)}</p>
              <p className="text-xs text-green-600 mt-1">across all counsellors</p>
            </div>
            <IndianRupee size={24} className="text-green-500 group-hover:scale-110 transition-transform" />
          </div>
        </Link>

        <Link href="/users"
          className="bg-blue-50 border border-blue-200 rounded-xl p-5 hover:bg-blue-100 transition-colors group">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-800">New Users This Month</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">{stats?.users.newThisMonth || 0}</p>
              <p className="text-xs text-blue-600 mt-1">{stats?.users.total || 0} total registered</p>
            </div>
            <Users size={24} className="text-blue-500 group-hover:scale-110 transition-transform" />
          </div>
        </Link>
      </div>
    </div>
  );
}
