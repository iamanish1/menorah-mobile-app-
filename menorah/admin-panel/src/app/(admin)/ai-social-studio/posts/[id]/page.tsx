'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle, Loader2, RefreshCw, Save, Send, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import InstagramPostPreview from '@/components/social-studio/InstagramPostPreview';
import SocialStudioTabs from '@/components/social-studio/SocialStudioTabs';
import StatusBadge from '@/components/social-studio/StatusBadge';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { SocialAspectRatio, SocialPost, SocialTemplateKey } from '@/types';

const splitTags = (value: string) => value.split(',').map((tag) => tag.trim().replace(/^#+/, '')).filter(Boolean);

export default function SocialPostReviewPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [post, setPost] = useState<SocialPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const [hookText, setHookText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [templateKey, setTemplateKey] = useState<SocialTemplateKey>('thought_leadership');
  const [aspectRatio, setAspectRatio] = useState<SocialAspectRatio>('4:5');

  const applyPost = (next: SocialPost) => {
    setPost(next);
    setHookText(next.hookText || '');
    setBodyText(next.bodyText || '');
    setCtaText(next.ctaText || '');
    setCaption(next.caption || '');
    setHashtags((next.hashtags || []).join(', '));
    setTemplateKey(next.templateKey || 'thought_leadership');
    setAspectRatio(next.aspectRatio || '4:5');
    setScheduledAt(next.scheduledAt ? next.scheduledAt.slice(0, 16) : '');
  };

  const load = useCallback(async () => {
    setLoading(true);
    const response = await api.getSocialPost(id);
    if (response.success && response.data?.post) {
      applyPost(response.data.post);
    } else {
      toast.error(response.message || 'Unable to load social post');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const previewPost = useMemo<SocialPost | null>(() => post ? ({
    ...post,
    hookText,
    bodyText,
    ctaText,
    caption,
    hashtags: splitTags(hashtags),
    templateKey,
    aspectRatio
  }) : null, [aspectRatio, bodyText, caption, ctaText, hashtags, hookText, post, templateKey]);

  const save = async () => {
    setSaving(true);
    const response = await api.updateSocialPost(id, {
      hookText,
      bodyText,
      ctaText,
      caption,
      hashtags: splitTags(hashtags),
      templateKey,
      aspectRatio
    });
    setSaving(false);
    if (response.success && response.data?.post) {
      applyPost(response.data.post);
      toast.success('Post saved and preview re-rendered');
      return;
    }
    toast.error(response.message || 'Unable to save post');
  };

  const runAction = async (name: string, fn: () => Promise<{ success: boolean; message?: string; data?: { post: SocialPost } }>, success: string) => {
    setAction(name);
    const response = await fn();
    setAction('');
    if (response.success && response.data?.post) {
      applyPost(response.data.post);
      toast.success(success);
      return true;
    }
    toast.error(response.message || 'Action failed');
    return false;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
        <div className="h-[620px] animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  if (!post || !previewPost) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">Social post not found.</p>
        <Link href="/ai-social-studio/posts" className="mt-3 inline-block text-sm font-semibold text-blue-600">Back to posts</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/ai-social-studio/posts" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline">
            <ArrowLeft size={16} />
            Back to posts
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">Review Instagram Post</h2>
            <StatusBadge status={post.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">Created {formatDate(post.createdAt)} - Quality {post.qualityScore || 0}/100</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={save} disabled={saving || action !== ''} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            <Save size={16} />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => runAction('caption', () => api.regenerateSocialCaption(id), 'Caption regenerated')} disabled={action !== ''} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            {action === 'caption' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Caption
          </button>
          <button onClick={() => runAction('image', () => api.regenerateSocialImage(id), 'Image re-rendered')} disabled={action !== ''} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            {action === 'image' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Image
          </button>
          <button onClick={() => setRejectOpen(true)} disabled={action !== ''} className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60">
            <XCircle size={16} />
            Reject
          </button>
          <button onClick={() => runAction('approve', () => api.approveSocialPost(id), 'Post approved')} disabled={action !== '' || post.status === 'published'} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
            <CheckCircle size={16} />
            Approve
          </button>
          <button onClick={() => setPublishOpen(true)} disabled={post.status !== 'approved' && post.status !== 'scheduled'} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
            <Send size={16} />
            Publish
          </button>
        </div>
      </div>

      <SocialStudioTabs />

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <InstagramPostPreview post={previewPost} />

        <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Editable Post Content</h3>
            <p className="mt-1 text-xs text-gray-500">Changing image text, template, or ratio re-renders the static post after save.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Template</span>
              <select value={templateKey} onChange={(event) => setTemplateKey(event.target.value as SocialTemplateKey)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="thought_leadership">Thought leadership</option>
                <option value="educational_tip">Educational tip</option>
                <option value="announcement">Announcement</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Aspect ratio</span>
              <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as SocialAspectRatio)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="1:1">1:1 square</option>
                <option value="4:5">4:5 portrait</option>
                <option value="9:16">9:16 story</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Hook text on image</span>
            <textarea value={hookText} onChange={(event) => setHookText(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Body text on image</span>
            <textarea value={bodyText} onChange={(event) => setBodyText(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-gray-400">For educational tips, separate lines with a vertical bar.</p>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">CTA text on image</span>
            <input value={ctaText} onChange={(event) => setCtaText(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Instagram caption</span>
            <textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={7} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Hashtags</span>
            <input value={hashtags} onChange={(event) => setHashtags(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-gray-400">Comma separated. The preview shows them exactly like Instagram hashtags.</p>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Schedule time</span>
            <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <button
              onClick={() => scheduledAt && runAction('schedule', () => api.scheduleSocialPost(id, new Date(scheduledAt).toISOString()), 'Post scheduled')}
              disabled={!scheduledAt || post.status !== 'approved' || action !== ''}
              className="mt-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Schedule approved post
            </button>
          </label>

          {post.qualityIssues && post.qualityIssues.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              {post.qualityIssues.map((issue) => <p key={issue}>{issue}</p>)}
            </div>
          )}
          {post.errorLog?.message && (
            <div className="rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">
              {post.errorLog.message}
            </div>
          )}
        </section>
      </div>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject Social Post">
        <div className="space-y-4">
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="Optional rejection reason" />
          <button
            onClick={async () => {
              const ok = await runAction('reject', () => api.rejectSocialPost(id, reason), 'Post rejected');
              if (ok) setRejectOpen(false);
            }}
            className="w-full rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Reject Post
          </button>
        </div>
      </Modal>

      <Modal open={publishOpen} onClose={() => setPublishOpen(false)} title="Publish to Instagram">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-600">This will publish the approved post through the official Meta Instagram API using the connected business account.</p>
          <button
            onClick={async () => {
              const ok = await runAction('publish', () => api.publishSocialPostNow(id), 'Post published to Instagram');
              if (ok) setPublishOpen(false);
            }}
            disabled={action !== ''}
            className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {action === 'publish' ? 'Publishing...' : 'Publish Now'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
