'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CalendarDays, Search, Tag, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge, Button, Spinner } from '@/components/ui';
import type { Article } from '@/types';

const ARTICLES_PER_PAGE = 9;

export function LearnArticlesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = parsePositiveInteger(searchParams.get('page'), 1);
  const q = searchParams.get('q')?.trim() ?? '';
  const category = searchParams.get('category')?.trim() ?? '';
  const [searchInput, setSearchInput] = useState(q);
  const [visibleArticles, setVisibleArticles] = useState<Article[]>([]);

  const filterSignature = `${q}__${category}`;

  const articlesQuery = useQuery({
    queryKey: ['app-articles', { page, q, category }],
    queryFn: () => api.getArticles({
      page,
      limit: ARTICLES_PER_PAGE,
      q: q || undefined,
      category: category || undefined,
    }),
    // Publishing happens outside this client. Always re-check canonical
    // articles when the reader returns to this screen or browser tab.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const categoriesQuery = useQuery({
    queryKey: ['article-categories'],
    queryFn: () => api.getArticleCategories(),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const pageArticles = useMemo(
    () => articlesQuery.data?.data?.articles ?? [],
    [articlesQuery.data?.data?.articles]
  );
  const pagination = articlesQuery.data?.data?.pagination;
  const totalPages = pagination?.pages ?? pagination?.totalPages ?? 1;
  const totalArticles = pagination?.total ?? visibleArticles.length;
  const hasNextPage = page < Math.max(totalPages, 1);
  const hasActiveFilters = Boolean(q || category);
  const hasFailed = Boolean(articlesQuery.data && !articlesQuery.data.success);

  const categories = useMemo(() => {
    const values = categoriesQuery.data?.data?.categories ?? [];
    if (category && !values.some((item) => item.toLowerCase() === category.toLowerCase())) {
      return [category, ...values];
    }
    return values;
  }, [categoriesQuery.data?.data?.categories, category]);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    setVisibleArticles([]);
  }, [filterSignature]);

  useEffect(() => {
    if (!articlesQuery.data) return;

    setVisibleArticles((previous) => {
      if (page <= 1) return pageArticles;
      return mergeArticles(previous, pageArticles);
    });
  }, [articlesQuery.data, page, pageArticles]);

  const updateRoute = (next: { q?: string; category?: string; page?: number }) => {
    const href = buildLearnHref({
      q: next.q ?? q,
      category: next.category ?? category,
      page: next.page,
    });
    router.push(href);
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateRoute({ q: searchInput.trim(), page: 1 });
  };

  const clearSearch = () => {
    setSearchInput('');
    updateRoute({ q: '', page: 1 });
  };

  return (
    <div className="page-container max-w-6xl">
      <header className="mb-6 overflow-hidden rounded-[1.75rem] border border-primary-100 bg-primary-50 px-5 py-5 shadow-[0_14px_32px_-26px_rgba(45,122,92,0.5)] dark:border-primary-800 dark:bg-primary-900/70">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-white/80 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-primary-700 shadow-sm dark:border-primary-700 dark:bg-primary-950/60 dark:text-primary-100">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Articles
            </div>
            <h1 className="app-page-heading mt-4">Read and learn</h1>
            <p className="app-page-subtitle mt-1 max-w-2xl">
              New Menorah articles from the pipeline appear here automatically.
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex w-full gap-2 lg:max-w-md">
            <label htmlFor="learn-article-search" className="sr-only">
              Search articles
            </label>
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-primary-100/55" />
              <input
                id="learn-article-search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search articles"
                className="input-field rounded-full pl-10 pr-10"
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition hover:bg-primary-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-100/55 dark:hover:bg-primary-900 dark:hover:text-primary-50"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <Button type="submit">Search</Button>
          </form>
        </div>
      </header>

      <section className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="Article categories">
        <CategoryPill active={!category} onClick={() => updateRoute({ category: '', page: 1 })}>
          All
        </CategoryPill>
        {categories.map((item) => (
          <CategoryPill
            key={item}
            active={item.toLowerCase() === category.toLowerCase()}
            onClick={() => updateRoute({ category: item, page: 1 })}
          >
            {item}
          </CategoryPill>
        ))}
      </section>

      {articlesQuery.isLoading && visibleArticles.length === 0 ? (
        <div className="flex min-h-[45vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : hasFailed ? (
        <ArticleErrorState message={articlesQuery.data?.message} onRetry={() => articlesQuery.refetch()} />
      ) : visibleArticles.length === 0 ? (
        <EmptyArticlesState hasActiveFilters={hasActiveFilters} onClear={() => router.push('/learn')} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-500 dark:text-primary-100/70">
              {articlesQuery.isFetching && page === 1
                ? 'Updating articles...'
                : `Showing ${visibleArticles.length} of ${totalArticles} article${totalArticles === 1 ? '' : 's'}`}
            </p>
            {category ? <Badge variant="primary" size="md">{category}</Badge> : null}
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleArticles.map((article, index) => (
              <ArticleCard key={getArticleKey(article)} article={article} index={index} />
            ))}
          </div>

          {hasNextPage ? (
            <div className="mt-8 flex justify-center">
              <Button
                loading={articlesQuery.isFetching}
                onClick={() => updateRoute({ page: page + 1 })}
              >
                Load More
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ArticleCard({ article, index }: { article: Article; index: number }) {
  const href = `/learn/${article.slug}`;
  const tags = article.tags ?? [];

  return (
    <article
      className="card group flex h-full min-h-[25rem] flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_60px_-38px_rgba(17,24,39,0.72)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <Link href={href} className="block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/20" aria-label={`Read ${article.title}`}>
        <div className="relative aspect-[16/10] overflow-hidden bg-primary-50 dark:bg-primary-900">
          {article.coverImageUrl ? (
            <img
              src={article.coverImageUrl}
              alt={article.title}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(61,148,112,0.2),transparent_40%),linear-gradient(135deg,rgba(240,249,244,0.96),rgba(255,255,255,0.9))] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(166,244,195,0.16),transparent_40%),linear-gradient(135deg,#07110b,#102016)]">
              <BookOpen className="h-12 w-12 text-primary-600/60 dark:text-primary-100/70" aria-hidden="true" />
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-wide text-primary-700 dark:text-primary-100/80">
          {article.category ? (
            <span className="inline-flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              {article.category}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 text-gray-400 dark:text-primary-100/50">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {formatArticleDate(article.publishedAt ?? article.createdAt)}
          </span>
        </div>

        <h2 className="mt-4 text-xl font-black leading-tight text-gray-950 dark:text-primary-50">
          <Link href={href} className="transition hover:text-primary-700 dark:hover:text-primary-200">
            {article.title}
          </Link>
        </h2>

        {article.excerpt ? (
          <p className="mt-3 line-clamp-3 text-sm leading-7 text-gray-500 dark:text-primary-100/65">
            {article.excerpt}
          </p>
        ) : null}

        {tags.length ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-gray-500 dark:bg-primary-900 dark:text-primary-100/70">
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <Link href={href} className="mt-auto inline-flex w-fit items-center gap-2 pt-6 text-sm font-black text-primary-700 transition hover:text-primary-900 dark:text-primary-100 dark:hover:text-primary-50">
          Read
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function CategoryPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center rounded-full border px-5 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        active
          ? 'border-primary-600 bg-primary-600 text-white shadow-[0_14px_30px_-22px_rgba(45,122,92,0.9)] dark:border-primary-400 dark:bg-primary-400 dark:text-primary-950'
          : 'border-primary-100 bg-white text-gray-600 hover:bg-primary-50 hover:text-gray-950 dark:border-primary-800 dark:bg-primary-950/70 dark:text-primary-100/70 dark:hover:bg-primary-900 dark:hover:text-primary-50'
      )}
    >
      {children}
    </button>
  );
}

function EmptyArticlesState({ hasActiveFilters, onClear }: { hasActiveFilters: boolean; onClear: () => void }) {
  return (
    <div className="card px-6 py-20 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900 dark:text-primary-100">
        <BookOpen className="h-8 w-8" aria-hidden="true" />
      </div>
      <h2 className="mt-6 text-2xl font-black text-gray-950 dark:text-primary-50">
        {hasActiveFilters ? 'No matching articles yet' : 'Articles are coming soon'}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-gray-500 dark:text-primary-100/65">
        {hasActiveFilters
          ? 'Try clearing your search or choosing another category.'
          : 'Published articles from the pipeline will appear here automatically.'}
      </p>
      {hasActiveFilters ? (
        <Button className="mt-6" variant="secondary" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

function ArticleErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="card px-6 py-20 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-200">
        <BookOpen className="h-8 w-8" aria-hidden="true" />
      </div>
      <h2 className="mt-6 text-2xl font-black text-gray-950 dark:text-primary-50">Articles could not load</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-gray-500 dark:text-primary-100/65">
        {message || 'Please check the API connection and try again.'}
      </p>
      <Button className="mt-6" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function mergeArticles(previous: Article[], next: Article[]) {
  const byKey = new Map(previous.map((article) => [getArticleKey(article), article]));
  next.forEach((article) => byKey.set(getArticleKey(article), article));
  return Array.from(byKey.values());
}

function getArticleKey(article: Article) {
  return article.id || article._id || article.slug;
}

function buildLearnHref({ page, q, category }: { page?: number; q?: string; category?: string }) {
  const params = new URLSearchParams();
  const safeQ = q?.trim();
  const safeCategory = category?.trim();

  if (safeQ) params.set('q', safeQ);
  if (safeCategory) params.set('category', safeCategory);
  if (page && page > 1) params.set('page', String(page));

  const queryString = params.toString();
  return queryString ? `/learn?${queryString}` : '/learn';
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatArticleDate(value?: string) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
