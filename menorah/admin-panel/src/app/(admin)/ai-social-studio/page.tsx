'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  BarChart3,
  Bot,
  CalendarClock,
  CircleCheckBig,
  CirclePlus,
  ClipboardCheck,
  Gauge,
  Instagram,
  Send,
  TriangleAlert
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import StatCard from '@/components/ui/StatCard';
import SocialStudioTabs from '@/components/social-studio/SocialStudioTabs';
import StatusBadge from '@/components/social-studio/StatusBadge';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { SocialPost, SocialStudioStats } from '@/types';

const chartColors = {
  review: '#f59e0b',
  approved: '#16a34a',
  scheduled: '#2563eb',
  published: '#0f766e',
  failed: '#ef4444',
  draft: '#64748b'
};

const chartTooltipStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
  fontSize: 12
};

const buildDailyActivity = (posts: SocialPost[]) => {
  const days = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return { key, day: date.toLocaleDateString('en-US', { weekday: 'short' }), generated: 0, published: 0 };
  });
  const byKey = new Map(days.map((day) => [day.key, day]));

  posts.forEach((post) => {
    const createdKey = new Date(post.createdAt).toISOString().slice(0, 10);
    const createdBucket = byKey.get(createdKey);
    if (createdBucket) createdBucket.generated += 1;

    if (post.publishedAt) {
      const publishedKey = new Date(post.publishedAt).toISOString().slice(0, 10);
      const publishedBucket = byKey.get(publishedKey);
      if (publishedBucket) publishedBucket.published += 1;
    }
  });

  return days;
};

const percentage = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;

export default function SocialStudioDashboardPage() {
  const [stats, setStats] = useState<SocialStudioStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSocialStudioStats().then((response) => {
      if (response.success && response.data) setStats(response.data);
      setLoading(false);
    });
  }, []);

  const dashboard = useMemo(() => {
    const counts = stats?.counts || {};
    const recentPosts = stats?.recentPosts || [];
    const failedCount = (counts.failed_generation || 0) + (counts.failed_publish || 0) + (counts.expired_token || 0);
    const totalPosts = Object.values(counts).reduce((sum, value) => sum + (value || 0), 0);
    const readyCount = (counts.approved || 0) + (counts.scheduled || 0);
    const completedCount = counts.published || 0;
    const reviewCount = counts.needs_review || 0;

    const statusData = [
      { name: 'Review', count: reviewCount, fill: chartColors.review },
      { name: 'Approved', count: counts.approved || 0, fill: chartColors.approved },
      { name: 'Scheduled', count: counts.scheduled || 0, fill: chartColors.scheduled },
      { name: 'Published', count: counts.published || 0, fill: chartColors.published },
      { name: 'Failed', count: failedCount, fill: chartColors.failed }
    ];

    const funnelData = [
      { stage: 'Drafts', value: counts.draft || 0 },
      { stage: 'Review', value: reviewCount },
      { stage: 'Approved', value: counts.approved || 0 },
      { stage: 'Scheduled', value: counts.scheduled || 0 },
      { stage: 'Published', value: counts.published || 0 }
    ];

    const qualityData = recentPosts
      .slice()
      .reverse()
      .map((post, index) => ({
        name: `Post ${index + 1}`,
        score: post.qualityScore || 0
      }));

    return {
      counts,
      recentPosts,
      failedCount,
      totalPosts,
      readyCount,
      completedCount,
      reviewCount,
      statusData,
      funnelData,
      qualityData,
      dailyActivity: buildDailyActivity(recentPosts),
      approvalRate: percentage((counts.approved || 0) + (counts.scheduled || 0) + (counts.published || 0), totalPosts),
      publishRate: percentage(completedCount, totalPosts),
      failureRate: percentage(failedCount, totalPosts),
      reviewLoad: percentage(reviewCount, Math.max(totalPosts, 1))
    };
  }, [stats]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-24 animate-pulse rounded-xl bg-white" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-white" />)}
        </div>
        <div className="grid gap-5 xl:grid-cols-3">
          {[...Array(3)].map((_, index) => <div key={index} className="h-72 animate-pulse rounded-xl bg-white" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">AI Social Studio</h2>
          <p className="mt-0.5 text-sm text-gray-500">Generate Instagram drafts, review them, then approve before publishing.</p>
        </div>
        <Link
          href="/ai-social-studio/generate"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <CirclePlus size={17} strokeWidth={2} />
          Generate New Post
        </Link>
      </div>

      <SocialStudioTabs />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Needs Review" value={dashboard.reviewCount} subtitle="waiting for admin approval" icon={ClipboardCheck} color="amber" />
        <StatCard title="Approved" value={dashboard.counts.approved || 0} subtitle="ready to schedule or publish" icon={CircleCheckBig} color="green" />
        <StatCard title="Scheduled" value={dashboard.counts.scheduled || 0} subtitle="waiting for publish time" icon={CalendarClock} color="blue" />
        <StatCard title="Failed" value={dashboard.failedCount} subtitle="generation or publish needs attention" icon={TriangleAlert} color="red" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900">Publishing Pipeline</h3>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">Status distribution across generated social posts.</p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{dashboard.totalPosts} total</span>
          </div>
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.statusData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {dashboard.statusData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Gauge size={18} className="text-emerald-600" />
            <h3 className="text-sm font-semibold text-gray-900">Approval Readiness</h3>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">Operational readiness for posts moving toward Instagram.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            {[
              { label: 'Approved+', value: dashboard.approvalRate, color: '#16a34a' },
              { label: 'Published', value: dashboard.publishRate, color: '#0f766e' },
              { label: 'Failures', value: dashboard.failureRate, color: '#ef4444' }
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-gray-50 p-4">
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ name: item.label, value: Math.max(item.value, 1), fill: item.color }]} startAngle={90} endAngle={-270}>
                      <RadialBar dataKey="value" cornerRadius={10} background={{ fill: '#e5e7eb' }} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-center text-2xl font-bold text-gray-900">{item.value}%</p>
                <p className="mt-1 text-center text-xs font-semibold text-gray-500">{item.label}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Seven Day Activity</h3>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">Generated and published post movement from recent activity.</p>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboard.dailyActivity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="generatedSocialGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="publishedSocialGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f766e" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Area type="monotone" dataKey="generated" stroke="#2563eb" strokeWidth={2} fill="url(#generatedSocialGrad)" />
                <Area type="monotone" dataKey="published" stroke="#0f766e" strokeWidth={2} fill="url(#publishedSocialGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-purple-600" />
            <h3 className="text-sm font-semibold text-gray-900">Quality Trend</h3>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">Quality score across the latest generated posts.</p>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.qualityData.length > 0 ? dashboard.qualityData : [{ name: 'No posts', score: 0 }]} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="score" fill="#7c3aed" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Recent Generated Posts</h3>
              <p className="mt-0.5 text-xs text-gray-500">Latest Social Studio output across all statuses.</p>
            </div>
            <Link href="/ai-social-studio/posts" className="text-xs font-semibold text-blue-600 hover:underline">View all</Link>
          </div>

          <div className="mt-4 divide-y divide-gray-100">
            {dashboard.recentPosts.length === 0 ? (
              <div className="py-12 text-center">
                <Bot size={34} className="mx-auto text-gray-300" />
                <p className="mt-3 text-sm font-medium text-gray-600">No posts yet</p>
                <p className="mt-1 text-xs text-gray-400">Generate your first Instagram draft from the Social Studio.</p>
              </div>
            ) : (
              dashboard.recentPosts.map((post) => (
                <Link key={post.id} href={`/ai-social-studio/posts/${post.id}`} className="flex items-center gap-4 py-4 hover:bg-gray-50">
                  <div className="h-16 w-16 overflow-hidden rounded-lg bg-gray-100">
                    {post.thumbnailUrl || post.finalImageUrl ? (
                      <img src={post.thumbnailUrl || post.finalImageUrl} alt={post.topic} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{post.topic}</p>
                    <p className="mt-1 truncate text-xs text-gray-500">{post.campaignName || 'No campaign'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={post.status} />
                    <span className="text-xs text-gray-400">{formatDate(post.createdAt)}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
                <Instagram size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Instagram Account</h3>
                <p className="text-xs text-gray-500">{stats?.connectedAccounts || 0} connected account{(stats?.connectedAccounts || 0) === 1 ? '' : 's'}</p>
              </div>
            </div>
            <Link href="/ai-social-studio/instagram" className="mt-4 inline-flex w-full justify-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Manage connection
            </Link>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Send size={17} className="text-blue-600" />
              <p className="text-sm font-semibold text-gray-900">Post Mix</p>
            </div>
            <div className="mt-4 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie data={dashboard.statusData} dataKey="count" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3}>
                    {dashboard.statusData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {dashboard.statusData.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                  {item.name}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-semibold text-emerald-900">Approval-first publishing</p>
            <p className="mt-2 text-xs leading-5 text-emerald-800">
              Generated posts enter review first. Instagram publishing is only available after admin approval and a connected official Meta account.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
