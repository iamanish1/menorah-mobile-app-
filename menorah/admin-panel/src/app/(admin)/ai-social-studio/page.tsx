'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, CheckCircle, Clock, Instagram, PlusCircle, Sparkles } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import SocialStudioTabs from '@/components/social-studio/SocialStudioTabs';
import StatusBadge from '@/components/social-studio/StatusBadge';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { SocialStudioStats } from '@/types';

export default function SocialStudioDashboardPage() {
  const [stats, setStats] = useState<SocialStudioStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSocialStudioStats().then((response) => {
      if (response.success && response.data) setStats(response.data);
      setLoading(false);
    });
  }, []);

  const failedCount = useMemo(() => {
    const counts = stats?.counts || {};
    return (counts.failed_generation || 0) + (counts.failed_publish || 0) + (counts.expired_token || 0);
  }, [stats]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-24 animate-pulse rounded-xl bg-white" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-white" />)}
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
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <PlusCircle size={16} />
          Generate New Post
        </Link>
      </div>

      <SocialStudioTabs />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Needs Review" value={stats?.counts.needs_review || 0} subtitle="waiting for admin approval" icon={Clock} color="amber" />
        <StatCard title="Approved" value={stats?.counts.approved || 0} subtitle="ready to schedule or publish" icon={CheckCircle} color="green" />
        <StatCard title="Scheduled" value={stats?.counts.scheduled || 0} subtitle="waiting for publish time" icon={CalendarDays} color="blue" />
        <StatCard title="Failed" value={failedCount} subtitle="generation or publish needs attention" icon={AlertTriangle} color="red" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Recent Generated Posts</h3>
              <p className="mt-0.5 text-xs text-gray-500">Latest Social Studio output across all statuses.</p>
            </div>
            <Link href="/ai-social-studio/posts" className="text-xs font-semibold text-blue-600 hover:underline">View all</Link>
          </div>

          <div className="mt-4 divide-y divide-gray-100">
            {(stats?.recentPosts || []).length === 0 ? (
              <div className="py-12 text-center">
                <Sparkles size={34} className="mx-auto text-gray-300" />
                <p className="mt-3 text-sm font-medium text-gray-600">No posts yet</p>
                <p className="mt-1 text-xs text-gray-400">Generate your first Instagram draft from the Social Studio.</p>
              </div>
            ) : (
              stats?.recentPosts.map((post) => (
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
