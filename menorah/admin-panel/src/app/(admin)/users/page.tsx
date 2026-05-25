'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { Search, Users, TrendingUp, UserCheck, Calendar } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import Badge from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { formatDate, getInitials } from '@/lib/utils';
import type { User, PlatformStats } from '@/types';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [dailyReg, setDailyReg] = useState<{ date: string; count: number }[]>([]);
  const [roleBreakdown, setRoleBreakdown] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<'user' | 'counsellor'>('user');

  useEffect(() => {
    Promise.all([api.getStats(), api.getUserStats()]).then(([s, u]) => {
      if (s.success && s.data) setStats(s.data);
      if (u.success && u.data) {
        setDailyReg(u.data.dailyRegistrations);
        setRoleBreakdown(u.data.byRole);
      }
    });
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await api.getUsers({ page, limit: 20, search: search || undefined, role: activeTab });
    if (res.success && res.data) {
      setUsers(res.data.users);
      setTotal(res.data.pagination.total);
      setPages(res.data.pagination.pages);
    }
    setLoading(false);
  }, [page, search, activeTab]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Users" value={stats?.users.total.toLocaleString() || '0'} subtitle={`+${stats?.users.newToday || 0} today`} icon={Users} color="blue" />
        <StatCard title="New This Month" value={stats?.users.newThisMonth || 0} subtitle="registered users" icon={TrendingUp} color="green" />
        <StatCard title="Total Counsellors" value={stats?.counsellors.approved || 0} subtitle={`${stats?.counsellors.pending || 0} pending`} icon={UserCheck} color="purple" />
        <StatCard title="Bookings Today" value={stats?.bookings.today || 0} subtitle={`${stats?.bookings.active || 0} active`} icon={Calendar} color="amber" />
      </div>

      {/* Registration trend chart */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">New User Registrations</h3>
            <p className="text-xs text-gray-500 mt-0.5">Last 30 days</p>
          </div>
          <div className="flex gap-3 text-xs">
            {Object.entries(roleBreakdown).map(([role, count]) => (
              <span key={role} className="flex items-center gap-1.5 text-gray-500 capitalize">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {role}: <strong className="text-gray-900">{count}</strong>
              </span>
            ))}
          </div>
        </div>
        {dailyReg.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={dailyReg} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip labelFormatter={(l) => formatDate(l)} />
              <Line type="monotone" dataKey="count" name="Registrations" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-gray-400 text-sm">No registration data yet</div>
        )}
      </div>

      {/* User table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {[{ key: 'user', label: 'App Users' }, { key: 'counsellor', label: 'Counsellors' }].map((t) => (
              <button key={t.key} onClick={() => { setActiveTab(t.key as 'user' | 'counsellor'); setPage(1); }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-500">{total} total</p>
          <div className="sm:ml-auto relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 pr-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-52"
            />
          </div>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-100">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-9 h-9 bg-gray-100 rounded-full" />
                <div className="flex-1 space-y-2"><div className="h-3.5 bg-gray-100 rounded w-36" /><div className="h-3 bg-gray-100 rounded w-48" /></div>
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="py-14 text-center text-gray-400 text-sm">No users found.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {users.map((u) => (
              <div key={u._id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50">
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-sm flex-shrink-0">
                  {getInitials(`${u.firstName} ${u.lastName}`)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{u.firstName} {u.lastName}</p>
                  <p className="text-xs text-gray-500 truncate">{u.email} · {u.phone}</p>
                </div>
                <div className="hidden md:flex items-center gap-2 flex-shrink-0">
                  {u.subscription?.isActive && (
                    <Badge variant="active" size="sm">{u.subscription.plan}</Badge>
                  )}
                  {!u.isActive && <Badge variant="blocked" size="sm">inactive</Badge>}
                  {!u.isEmailVerified && <Badge variant="pending" size="sm">unverified</Badge>}
                </div>
                <div className="hidden sm:block text-right flex-shrink-0">
                  <p className="text-xs text-gray-500">{u.bookingCount || 0} bookings</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(u.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {page} of {pages} · {total} total</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
