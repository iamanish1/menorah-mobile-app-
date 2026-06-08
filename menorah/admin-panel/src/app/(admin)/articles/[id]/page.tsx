'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, Save, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { Article, ArticleContentBlock, ArticleStatus } from '@/types';

const statusVariant = (status: ArticleStatus) => {
  if (status === 'published') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'review') return 'pending';
  return 'default';
};

function renderBlock(block: ArticleContentBlock, index: number) {
  if (block.type === 'heading') {
    return <h2 key={index} className="mt-7 text-xl font-bold text-gray-900">{block.text}</h2>;
  }

  if (block.type === 'quote') {
    return (
      <blockquote key={index} className="mt-5 border-l-4 border-blue-500 bg-blue-50 px-4 py-3 text-sm italic text-gray-700">
        {block.text}
      </blockquote>
    );
  }

  if (block.type === 'bullet_list') {
    return (
      <ul key={index} className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-700">
        {(block.items || []).map((item) => <li key={item}>{item}</li>)}
      </ul>
    );
  }

  if (block.type === 'image' && block.url) {
    return (
      <figure key={index} className="mt-5">
        <img src={block.url} alt={block.alt || ''} className="max-h-80 w-full rounded-xl object-cover" />
        {block.caption && <figcaption className="mt-2 text-xs text-gray-500">{block.caption}</figcaption>}
      </figure>
    );
  }

  if (block.type === 'callout') {
    return (
      <div key={index} className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
        {block.text}
      </div>
    );
  }

  return <p key={index} className="mt-4 text-sm leading-7 text-gray-700">{block.text}</p>;
}

export default function ArticleReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [contentBlocksJson, setContentBlocksJson] = useState('[]');

  const load = useCallback(async () => {
    setLoading(true);
    const response = await api.getArticle(id);
    if (response.success && response.data?.article) {
      const next = response.data.article;
      setArticle(next);
      setTitle(next.title || '');
      setExcerpt(next.excerpt || '');
      setCategory(next.category || '');
      setTags((next.tags || []).join(', '));
      setCoverImageUrl(next.coverImageUrl || '');
      setSeoTitle(next.seoTitle || '');
      setSeoDescription(next.seoDescription || '');
      setContentBlocksJson(JSON.stringify(next.contentBlocks || [], null, 2));
    } else {
      toast.error(response.message || 'Unable to load article');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const parsedBlocks = useMemo(() => {
    try {
      return JSON.parse(contentBlocksJson) as ArticleContentBlock[];
    } catch {
      return article?.contentBlocks || [];
    }
  }, [article?.contentBlocks, contentBlocksJson]);

  const save = async () => {
    let contentBlocks: ArticleContentBlock[];
    try {
      contentBlocks = JSON.parse(contentBlocksJson) as ArticleContentBlock[];
      if (!Array.isArray(contentBlocks)) throw new Error('Content blocks must be an array');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid content block JSON');
      return;
    }

    setSaving(true);
    const response = await api.updateArticle(id, {
      title,
      excerpt,
      category,
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      coverImageUrl,
      seoTitle,
      seoDescription,
      contentBlocks
    });
    setSaving(false);

    if (response.success && response.data?.article) {
      setArticle(response.data.article);
      toast.success('Article saved');
      return;
    }

    toast.error(response.message || 'Unable to save article');
  };

  const publish = async () => {
    setActionLoading('publish');
    const response = await api.publishArticle(id);
    setActionLoading('');

    if (response.success) {
      toast.success('Article published');
      router.push('/articles?status=published');
      return;
    }

    toast.error(response.message || 'Unable to publish article');
  };

  const reject = async () => {
    setActionLoading('reject');
    const response = await api.rejectArticle(id, rejectReason);
    setActionLoading('');

    if (response.success) {
      toast.success('Article rejected');
      setRejectOpen(false);
      router.push('/articles?status=rejected');
      return;
    }

    toast.error(response.message || 'Unable to reject article');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
        <div className="h-96 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">Article not found.</p>
        <Link href="/articles" className="mt-3 inline-block text-sm font-semibold text-blue-600">Back to articles</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/articles" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline">
            <ArrowLeft size={16} />
            Back to articles
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">Review Article</h2>
            <Badge variant={statusVariant(article.status)}>{article.status === 'review' ? 'queued' : article.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {article.wordCount || 0} words - Created {formatDate(article.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => setRejectOpen(true)}
            disabled={actionLoading !== ''}
            className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            <XCircle size={16} />
            Reject
          </button>
          <button
            onClick={publish}
            disabled={actionLoading !== ''}
            className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            <CheckCircle size={16} />
            {actionLoading === 'publish' ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Edit Article</h3>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Excerpt</span>
            <textarea value={excerpt} onChange={(event) => setExcerpt(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Category</span>
              <input value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Tags</span>
              <input value={tags} onChange={(event) => setTags(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Cover Image URL</span>
            <input value={coverImageUrl} onChange={(event) => setCoverImageUrl(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">SEO Title</span>
            <input value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">SEO Description</span>
            <textarea value={seoDescription} onChange={(event) => setSeoDescription(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Content Blocks JSON</span>
            <textarea value={contentBlocksJson} onChange={(event) => setContentBlocksJson(event.target.value)} rows={14} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs" />
          </label>
        </section>

        <article className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {coverImageUrl && <img src={coverImageUrl} alt={title} className="h-72 w-full rounded-t-xl object-cover" />}
          <div className="p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="active">{category || 'Article'}</Badge>
              <span className="text-xs text-gray-400">{article.wordCount || 0} words</span>
            </div>
            <h1 className="mt-4 text-3xl font-bold leading-tight text-gray-950">{title}</h1>
            <p className="mt-4 text-base leading-7 text-gray-600">{excerpt}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {tags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{tag}</span>
              ))}
            </div>
            <div className="mt-7 border-t border-gray-100 pt-2">
              {parsedBlocks.map(renderBlock)}
            </div>
          </div>
        </article>
      </div>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject Article">
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-gray-700">Reason</span>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="Optional reason for rejection"
            />
          </label>
          <button
            onClick={reject}
            disabled={actionLoading === 'reject'}
            className="w-full rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {actionLoading === 'reject' ? 'Rejecting...' : 'Reject Article'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
