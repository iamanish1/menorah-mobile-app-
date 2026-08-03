'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileImage, Film, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import SocialStudioTabs from '@/components/social-studio/SocialStudioTabs';
import StatusBadge from '@/components/social-studio/StatusBadge';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { SocialPost, SocialPostStatus } from '@/types';

const statusTabs: { key: SocialPostStatus | 'all'; label: string }[] = [
  { key: 'draft', label: 'Drafts' },
  { key: 'needs_review', label: 'Needs Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'failed_publish', label: 'Failed' },
  { key: 'all', label: 'All' }
];

export default function SocialPostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [status, setStatus] = useState<SocialPostStatus | 'all'>('needs_review');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [topic, setTopic] = useState('');
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [mediaKind, setMediaKind] = useState<'image' | 'reel'>('image');
  const [videoFile, setVideoFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await api.getSocialPosts({ status, q: query || undefined, page, limit: 12 });
    if (response.success && response.data) {
      setPosts(response.data.posts);
      setTotal(response.data.pagination.total);
      setPages(response.data.pagination.pages || 1);
    } else {
      toast.error(response.message || 'Unable to load posts');
    }
    setLoading(false);
  }, [page, query, status]);

  useEffect(() => {
    load();
  }, [load]);

  const createManualPost = async () => {
    if (topic.trim().length < 3 || caption.trim().length < 3 || (mediaKind === 'image' && !imageUrl.trim()) || (mediaKind === 'reel' && !videoFile)) {
      toast.error(mediaKind === 'reel' ? 'Add a topic, caption, and MP4 or MOV video' : 'Add a topic, caption, and HTTPS image URL');
      return;
    }

    setCreating(true);
    const response = mediaKind === 'reel' && videoFile
      ? await (() => {
        const form = new FormData();
        form.set('topic', topic.trim());
        form.set('caption', caption.trim());
        form.set('hashtags', hashtags);
        form.set('video', videoFile);
        return api.createManualSocialReel(form);
      })()
      : await api.createManualSocialPost({
        topic: topic.trim(),
        caption: caption.trim(),
        imageUrl: imageUrl.trim(),
        hashtags: hashtags.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean)
      });
    setCreating(false);

    if (response.success && response.data?.post) {
      setCreateOpen(false);
      setTopic('');
      setCaption('');
      setImageUrl('');
      setHashtags('');
      setVideoFile(null);
      setMediaKind('image');
      toast.success(mediaKind === 'reel' ? 'Reel uploaded to the review queue' : 'Social post added to the review queue');
      router.push(`/ai-social-studio/posts/${response.data.post.id}`);
      return;
    }

    toast.error(response.message || 'Unable to create social post');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Social Studio Posts</h2>
          <p className="mt-0.5 text-sm text-gray-500">{total} total posts in this view</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search posts..."
              className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-72"
            />
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
          >
            <Plus size={16} />
            Create Social Post
          </button>
        </div>
      </div>
      <SocialStudioTabs />

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setStatus(tab.key);
              setPage(1);
            }}
            className={`flex-shrink-0 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              status === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, index) => <div key={index} className="h-80 animate-pulse rounded-xl bg-gray-100" />)}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileImage size={36} className="text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-600">No social posts found</p>
            <p className="mt-1 text-xs text-gray-400">Generated Instagram posts will appear here for review.</p>
          </div>
        ) : (
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {posts.map((post) => (
              <Link key={post.id} href={`/ai-social-studio/posts/${post.id}`} className="group overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md">
                <div className="relative aspect-[4/3] bg-gray-100">
                  {post.postType === 'reel' && post.videoUrl ? (
                    <video src={post.videoUrl} muted playsInline preload="metadata" className="h-full w-full bg-black object-cover" />
                  ) : post.thumbnailUrl || post.finalImageUrl ? (
                    <img src={post.thumbnailUrl || post.finalImageUrl} alt={post.topic} className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-300"><FileImage size={32} /></div>
                  )}
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={post.status} />
                    <span className="text-xs text-gray-400">{formatDate(post.createdAt)}</span>
                  </div>
                  <div>
                    <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">{post.topic}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{post.caption}</p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{post.campaignName || 'No campaign'}</span>
                    <span>{post.qualityScore || 0}/100</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-50">
            Previous
          </button>
          <span className="text-xs text-gray-500">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-50">
            Next
          </button>
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Social Post">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-600">
            Create an image post or upload a Reel without using AI. It enters review first; no upload can reach Instagram until an admin approves and explicitly publishes it.
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setMediaKind('image')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${mediaKind === 'image' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Image post
            </button>
            <button
              type="button"
              onClick={() => setMediaKind('reel')}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${mediaKind === 'reel' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Film size={15} /> Video Reel
            </button>
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-gray-700">Topic</span>
            <input value={topic} onChange={(event) => setTopic(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="Mental health awareness" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-gray-700">Instagram caption</span>
            <textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="Post caption" />
          </label>
          {mediaKind === 'image' ? (
            <label className="block">
              <span className="text-sm font-semibold text-gray-700">Hosted image URL</span>
              <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="https://…" inputMode="url" />
              <p className="mt-1 text-xs text-gray-400">Use an HTTPS image. You can update it in the review screen.</p>
            </label>
          ) : (
            <label className="block">
              <span className="text-sm font-semibold text-gray-700">Reel video</span>
              <input
                type="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                onChange={(event) => setVideoFile(event.target.files?.[0] || null)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-400">MP4 or MOV, up to the configured 50 MB default. Production Reel uploads require Cloudinary media hosting.</p>
            </label>
          )}
          <label className="block">
            <span className="text-sm font-semibold text-gray-700">Hashtags</span>
            <input value={hashtags} onChange={(event) => setHashtags(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="mentalhealth, support" />
          </label>
          <button
            onClick={createManualPost}
            disabled={creating}
            className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {creating ? (mediaKind === 'reel' ? 'Uploading...' : 'Adding...') : 'Add to Review Queue'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
