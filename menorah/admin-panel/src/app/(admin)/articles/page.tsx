'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { FileText, Play, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { Article, ArticleGenerationRun, ArticleStatus } from '@/types';

const STATUS_TABS: { key: ArticleStatus | 'all'; label: string }[] = [
  { key: 'review', label: 'Queued' },
  { key: 'published', label: 'Published' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' }
];

const statusVariant = (status: ArticleStatus) => {
  if (status === 'published') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'review') return 'pending';
  return 'default';
};

const terminalRunStatuses = ['completed', 'partial', 'failed'];

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [activeTab, setActiveTab] = useState<ArticleStatus | 'all'>(() => {
    if (typeof window === 'undefined') return 'review';
    const status = new URLSearchParams(window.location.search).get('status');
    return STATUS_TABS.some((tab) => tab.key === status) ? status as ArticleStatus | 'all' : 'review';
  });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [count, setCount] = useState(10);
  const [starting, setStarting] = useState(false);
  const [activeRun, setActiveRun] = useState<ArticleGenerationRun | null>(null);

  const subtitle = useMemo(() => {
    const label = STATUS_TABS.find((tab) => tab.key === activeTab)?.label || 'Articles';
    return `${total} total · ${label}`;
  }, [activeTab, total]);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    const response = await api.getArticles({
      status: activeTab,
      page,
      limit: 12,
      q: query || undefined
    });

    if (response.success && response.data) {
      setArticles(response.data.articles);
      setTotal(response.data.pagination.total);
      setPages(response.data.pagination.pages || 1);
    } else {
      toast.error(response.message || 'Unable to load articles');
    }
    setLoading(false);
  }, [activeTab, page, query]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  useEffect(() => {
    if (!activeRun || terminalRunStatuses.includes(activeRun.status)) {
      return;
    }

    const timer = window.setInterval(async () => {
      const response = await api.getArticleGenerationRun(activeRun.id);
      if (response.success && response.data?.run) {
        setActiveRun(response.data.run);
        if (terminalRunStatuses.includes(response.data.run.status)) {
          loadArticles();
        }
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [activeRun, loadArticles]);

  const startGeneration = async () => {
    setStarting(true);
    const response = await api.startArticleGenerationRun(count);
    setStarting(false);

    if (response.success && response.data?.run) {
      setActiveRun(response.data.run);
      setModalOpen(false);
      toast.success('Article generation started');
      return;
    }

    toast.error(response.message || 'Unable to start article generation');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Articles</h2>
          <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search articles..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-64"
            />
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Play size={16} />
            Start Generation
          </button>
        </div>
      </div>

      {activeRun && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={activeRun.status === 'failed' ? 'rejected' : activeRun.status === 'completed' ? 'approved' : 'active'}>
                  {activeRun.status}
                </Badge>
                <p className="text-sm font-semibold text-gray-900">
                  {activeRun.completedCount}/{activeRun.requestedCount} generated
                </p>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                Failed: {activeRun.failedCount} · Source: {activeRun.source} · Timezone: {activeRun.timezone}
              </p>
              {activeRun.errors && activeRun.errors.length > 0 && (
                <p className="mt-2 text-xs text-red-700">{activeRun.errors[0].message}</p>
              )}
            </div>
            <button
              onClick={async () => {
                const response = await api.getArticleGenerationRun(activeRun.id);
                if (response.success && response.data?.run) setActiveRun(response.data.run);
                loadArticles();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setPage(1);
            }}
            className={`flex-shrink-0 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="h-64 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText size={36} className="text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-600">No articles found</p>
            <p className="mt-1 text-xs text-gray-400">Generated articles will appear here for review.</p>
          </div>
        ) : (
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/articles/${article.id}`}
                className="group overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md"
              >
                <div className="relative h-36 bg-gray-100">
                  {article.coverImageUrl ? (
                    <Image
                      src={article.coverImageUrl}
                      alt={article.title}
                      fill
                      unoptimized
                      className="object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-300">
                      <FileText size={32} />
                    </div>
                  )}
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={statusVariant(article.status)}>{article.status === 'review' ? 'queued' : article.status}</Badge>
                    <span className="text-xs text-gray-400">{formatDate(article.createdAt)}</span>
                  </div>
                  <div>
                    <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">{article.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{article.excerpt}</p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{article.category}</span>
                    <span>{article.wordCount || 0} words</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">Page {page} of {pages}</span>
          <button
            disabled={page >= pages}
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Start Article Generation">
        <div className="space-y-5">
          <div>
            <label className="text-sm font-semibold text-gray-700">Number of articles</label>
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(event) => setCount(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
              className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-2 text-xs text-gray-500">Manual batches can create 1 to 20 articles. Each article is queued for approval.</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-600">
            The backend will choose varied men&apos;s mental-health topics, generate about 700 words per article, create a cover image, and keep everything unpublished until review.
          </div>
          <button
            onClick={startGeneration}
            disabled={starting}
            className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {starting ? 'Starting...' : 'Start'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
