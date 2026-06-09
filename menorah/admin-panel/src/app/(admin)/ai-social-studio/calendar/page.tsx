'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import SocialStudioTabs from '@/components/social-studio/SocialStudioTabs';
import StatusBadge from '@/components/social-studio/StatusBadge';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { SocialPost } from '@/types';

export default function SocialCalendarPage() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getSocialPosts({ status: 'scheduled', limit: 50 }),
      api.getSocialPosts({ status: 'published', limit: 50 }),
      api.getSocialPosts({ status: 'failed_publish', limit: 50 })
    ]).then(([scheduled, published, failed]) => {
      const next = [
        ...(scheduled.data?.posts || []),
        ...(published.data?.posts || []),
        ...(failed.data?.posts || [])
      ].sort((a, b) => {
        const left = new Date(a.scheduledAt || a.publishedAt || a.updatedAt || a.createdAt).getTime();
        const right = new Date(b.scheduledAt || b.publishedAt || b.updatedAt || b.createdAt).getTime();
        return right - left;
      });
      if (!scheduled.success || !published.success || !failed.success) toast.error('Unable to load full calendar');
      setPosts(next);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Social Calendar</h2>
        <p className="mt-0.5 text-sm text-gray-500">Scheduled, published, and failed Instagram posts.</p>
      </div>
      <SocialStudioTabs />

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-5">
            <div className="h-72 animate-pulse rounded-xl bg-gray-100" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarDays size={36} className="text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-600">No scheduled or published posts yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {posts.map((post) => (
              <Link key={post.id} href={`/ai-social-studio/posts/${post.id}`} className="grid gap-4 px-5 py-4 hover:bg-gray-50 md:grid-cols-[90px_minmax(0,1fr)_160px_120px] md:items-center">
                <div className="h-20 w-20 overflow-hidden rounded-lg bg-gray-100">
                  {post.thumbnailUrl || post.finalImageUrl ? <img src={post.thumbnailUrl || post.finalImageUrl} alt={post.topic} className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{post.topic}</p>
                  <p className="mt-1 truncate text-xs text-gray-500">{post.campaignName || 'No campaign'}</p>
                </div>
                <div className="text-xs text-gray-500">
                  {post.scheduledAt ? `Scheduled ${formatDate(post.scheduledAt)}` : post.publishedAt ? `Published ${formatDate(post.publishedAt)}` : formatDate(post.updatedAt || post.createdAt)}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={post.status} />
                  <ExternalLink size={15} className="text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
