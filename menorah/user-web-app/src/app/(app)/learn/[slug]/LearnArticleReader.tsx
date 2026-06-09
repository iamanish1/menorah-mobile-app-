'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, BookOpen, CalendarDays, CheckCircle2, Quote, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import type { Article, ArticleContentBlock } from '@/types';

export function LearnArticleReader({ slug }: { slug: string }) {
  const articleQuery = useQuery({
    queryKey: ['app-article', slug],
    queryFn: () => api.getArticle(slug),
    enabled: Boolean(slug),
  });

  const article = articleQuery.data?.data?.article;
  const hasFailed = Boolean(articleQuery.data && !articleQuery.data.success);

  if (articleQuery.isLoading) {
    return (
      <div className="page-container max-w-4xl">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (hasFailed || !article) {
    return (
      <div className="page-container max-w-3xl">
        <Link href="/learn" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-primary-700 transition hover:text-primary-900 dark:text-primary-100 dark:hover:text-primary-50">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to articles
        </Link>

        <div className="card px-6 py-20 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-200">
            <AlertCircle className="h-8 w-8" aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-2xl font-black text-gray-950 dark:text-primary-50">Article could not load</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-gray-500 dark:text-primary-100/65">
            {articleQuery.data?.message || 'This article may have moved, or it may not be published yet.'}
          </p>
          <Button className="mt-6" onClick={() => articleQuery.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-4xl">
      <Link href="/learn" className="inline-flex items-center gap-2 text-sm font-bold text-primary-700 transition hover:text-primary-900 dark:text-primary-100 dark:hover:text-primary-50">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to articles
      </Link>

      <article className="mt-6">
        <header className="card overflow-hidden">
          {article.coverImageUrl ? (
            <figure className="aspect-[16/9] max-h-[34rem] overflow-hidden bg-primary-50 dark:bg-primary-900">
              <img src={article.coverImageUrl} alt={article.title} className="h-full w-full object-cover" />
            </figure>
          ) : (
            <div className="flex aspect-[16/9] max-h-[24rem] items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(61,148,112,0.2),transparent_40%),linear-gradient(135deg,rgba(240,249,244,0.96),rgba(255,255,255,0.9))] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(166,244,195,0.16),transparent_40%),linear-gradient(135deg,#07110b,#102016)]">
              <BookOpen className="h-16 w-16 text-primary-600/60 dark:text-primary-100/70" aria-hidden="true" />
            </div>
          )}

          <div className="p-6 md:p-8">
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

            <h1 className="mt-5 text-3xl font-black leading-tight text-gray-950 dark:text-primary-50 md:text-5xl">
              {article.title}
            </h1>

            {article.excerpt ? (
              <p className="mt-5 max-w-3xl text-base leading-8 text-gray-500 dark:text-primary-100/65 md:text-lg">
                {article.excerpt}
              </p>
            ) : null}

            {article.tags?.length ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-bold text-gray-500 dark:bg-primary-900 dark:text-primary-100/70">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        <ArticleBody article={article} />
      </article>
    </div>
  );
}

function ArticleBody({ article }: { article: Article }) {
  const blocks = article.contentBlocks ?? [];

  if (!blocks.length) {
    return (
      <section className="card mt-6 p-8 text-center">
        <BookOpen className="mx-auto h-10 w-10 text-primary-600/60 dark:text-primary-100/70" aria-hidden="true" />
        <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-gray-500 dark:text-primary-100/65">
          This article is published, but the body content is not available yet.
        </p>
      </section>
    );
  }

  return (
    <section className="card mt-6 p-6 md:p-9">
      <div className="mx-auto max-w-3xl space-y-7">
        {blocks.map((block, index) => (
          <ArticleContentBlockRenderer key={`${block.type}-${index}`} block={block} />
        ))}
      </div>
    </section>
  );
}

function ArticleContentBlockRenderer({ block }: { block: ArticleContentBlock }) {
  switch (block.type) {
    case 'heading':
      return <ArticleHeading level={block.level} text={block.text} />;
    case 'paragraph':
      return <p className="text-[17px] leading-8 text-gray-700 dark:text-primary-100/75">{block.text}</p>;
    case 'quote':
      return (
        <blockquote className="rounded-2xl border-l-4 border-primary-600 bg-primary-50 p-5 text-xl font-semibold leading-9 text-gray-950 dark:border-primary-300 dark:bg-primary-900 dark:text-primary-50">
          <Quote className="mb-3 h-5 w-5 text-primary-600 dark:text-primary-200" aria-hidden="true" />
          {block.text}
        </blockquote>
      );
    case 'bullet_list':
      return (
        <ul className="space-y-3 text-[17px] leading-8 text-gray-700 dark:text-primary-100/75">
          {(block.items ?? []).map((item) => (
            <li key={item} className="flex gap-3">
              <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-200" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case 'image':
      if (!block.url) return null;
      return (
        <figure className="overflow-hidden rounded-2xl border border-primary-100 bg-primary-50 dark:border-primary-800 dark:bg-primary-900">
          <img src={block.url} alt={block.alt || ''} className="w-full object-cover" loading="lazy" />
          {block.caption ? <figcaption className="px-4 py-3 text-sm text-gray-500 dark:text-primary-100/60">{block.caption}</figcaption> : null}
        </figure>
      );
    case 'callout':
      return (
        <aside className="rounded-2xl border border-primary-100 bg-primary-50 p-5 text-base font-semibold leading-8 text-gray-800 dark:border-primary-800 dark:bg-primary-900 dark:text-primary-100">
          {block.text}
        </aside>
      );
    case 'unknown':
      return block.text ? <p className="text-[17px] leading-8 text-gray-700 dark:text-primary-100/75">{block.text}</p> : null;
  }
}

function ArticleHeading({ level, text }: { level?: number; text: string }) {
  const safeLevel = typeof level === 'number' ? Math.min(Math.max(Math.floor(level), 2), 4) : 2;

  if (safeLevel === 3) {
    return <h3 className="pt-3 text-2xl font-black leading-tight text-gray-950 dark:text-primary-50">{text}</h3>;
  }

  if (safeLevel === 4) {
    return <h4 className="pt-2 text-xl font-black leading-tight text-gray-950 dark:text-primary-50">{text}</h4>;
  }

  return <h2 className="pt-4 text-3xl font-black leading-tight text-gray-950 dark:text-primary-50">{text}</h2>;
}

function formatArticleDate(value?: string) {
  if (!value) return 'Recently published';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently published';

  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
