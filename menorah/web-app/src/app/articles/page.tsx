'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CalendarDays, Search, Tag } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { isPublishedArticle } from '@/lib/articles';
import type { Article } from '@/types';
import styles from './articles.module.css';

const ARTICLES_PER_PAGE = 12;

const articleKey = (article: Article) => article.id || article._id || article.slug;

export default function ArticlesPage() {
  return (
    <Suspense fallback={<ArticlesLoadingFallback />}>
      <ArticlesPageContent />
    </Suspense>
  );
}

function ArticlesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();
  const page = parsePositiveInteger(searchParams.get('page'), 1);
  const q = searchParams.get('q')?.trim() || '';
  const [search, setSearch] = useState(q);

  useEffect(() => {
    setSearch(q);
  }, [q]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const {
    data,
    isLoading: articlesLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['articles', { page, q }],
    enabled: isAuthenticated,
    queryFn: async () => {
      const response = await api.getArticles({
        page,
        limit: ARTICLES_PER_PAGE,
        q: q || undefined,
      });

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Unable to load articles');
      }

      return {
        ...response.data,
        articles: response.data.articles.filter(isPublishedArticle),
      };
    },
  });

  const articles = data?.articles || [];
  const pagination = data?.pagination;
  const subtitle = useMemo(() => {
    if (q) {
      return `${pagination?.total ?? articles.length} CMS article result${(pagination?.total ?? articles.length) === 1 ? '' : 's'} for "${q}"`;
    }

    return 'Published CMS articles from the Menorah AI article pipeline.';
  }, [articles.length, pagination?.total, q]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    const trimmedSearch = search.trim();

    if (trimmedSearch) {
      params.set('q', trimmedSearch);
    }

    router.push(params.toString() ? `/articles?${params}` : '/articles');
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
        <p className={styles.stateText}>Loading articles...</p>
      </div>
    );
  }

  return (
    <AppLayout>
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>CMS Library</p>
          <h1 className={styles.pageTitle}>Articles</h1>
          <p className={styles.pageSubtitle}>{subtitle}</p>
        </div>
      </div>

      <form className={styles.toolbar} onSubmit={handleSearch}>
        <label className={styles.searchBox}>
          <Search size={18} color="var(--color-text-muted)" />
          <span className="sr-only">Search articles</span>
          <input
            className={styles.searchInput}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search published articles"
            autoComplete="off"
          />
        </label>
        <Button type="submit" variant="primary" size="md">Search</Button>
      </form>

      {articlesLoading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p className={styles.stateText}>Loading CMS articles...</p>
        </div>
      ) : isError ? (
        <div className={styles.errorState}>
          <BookOpen size={36} color="var(--color-primary)" />
          <p className={styles.stateTitle}>Articles could not load</p>
          <p className={styles.stateText}>{error instanceof Error ? error.message : 'Please try again.'}</p>
          <div style={{ marginTop: 16 }}>
            <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </div>
        </div>
      ) : articles.length ? (
        <>
          <div className={styles.grid}>
            {articles.map((article) => (
              <ArticleCard key={articleKey(article)} article={article} />
            ))}
          </div>
          <Pagination page={page} q={q} hasNextPage={page < (pagination?.pages || 1)} hasPreviousPage={page > 1} />
        </>
      ) : (
        <div className={styles.emptyState}>
          <BookOpen size={36} color="var(--color-primary)" />
          <p className={styles.stateTitle}>{q ? 'No matching CMS articles' : 'No published articles yet'}</p>
          <p className={styles.stateText}>
            {q
              ? 'Try a different search term.'
              : 'Articles generated in the AI pipeline will appear here after admin review and publish.'}
          </p>
          {q ? (
            <div style={{ marginTop: 16 }}>
              <Link href="/articles">
                <Button type="button" variant="outline" size="sm">Clear search</Button>
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </AppLayout>
  );
}

function ArticlesLoadingFallback() {
  return (
    <div className={styles.loadingState}>
      <div className={styles.spinner} />
      <p className={styles.stateText}>Loading articles...</p>
    </div>
  );
}

function ArticleCard({ article }: { article: Article }) {
  const href = `/articles/${article.slug}`;

  return (
    <article className={styles.articleCard}>
      <Link href={href} aria-label={`Open article ${article.title}`}>
        <div className={styles.cardImage}>
          {article.coverImageUrl ? (
            <img src={article.coverImageUrl} alt={article.title} loading="lazy" />
          ) : (
            <div className={styles.imageFallback}>{article.title.charAt(0).toUpperCase()}</div>
          )}
        </div>
      </Link>

      <div className={styles.cardBody}>
        <div className={styles.metaRow}>
          {article.category ? (
            <Badge variant="info" size="sm">{article.category}</Badge>
          ) : null}
          <span>
            <CalendarDays size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
            {formatDate(article.publishedAt || article.createdAt)}
          </span>
        </div>

        <h2 className={styles.cardTitle}>
          <Link href={href}>{article.title}</Link>
        </h2>
        {article.excerpt ? <p className={styles.cardExcerpt}>{article.excerpt}</p> : null}

        {article.tags?.length ? (
          <div className={styles.tags}>
            {article.tags.slice(0, 3).map((tag) => (
              <span key={tag} className={styles.tag}>
                <Tag size={12} />
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <Link href={href} className={styles.cardFooter}>
          Read article
          <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}

function Pagination({
  page,
  q,
  hasNextPage,
  hasPreviousPage,
}: {
  page: number;
  q: string;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}) {
  if (!hasNextPage && !hasPreviousPage) {
    return null;
  }

  return (
    <div className={styles.pagination}>
      {hasPreviousPage ? (
        <Link href={buildArticlesHref({ page: page - 1, q })}>
          <Button type="button" variant="outline" size="sm">Previous</Button>
        </Link>
      ) : null}
      {hasNextPage ? (
        <Link href={buildArticlesHref({ page: page + 1, q })}>
          <Button type="button" variant="outline" size="sm">Next</Button>
        </Link>
      ) : null}
    </div>
  );
}

function buildArticlesHref({ page, q }: { page: number; q: string }) {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set('page', String(page));
  }

  if (q) {
    params.set('q', q);
  }

  return params.toString() ? `/articles?${params}` : '/articles';
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Recently';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
