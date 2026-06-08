'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, CalendarDays, Tag } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import type { ArticleContentBlock } from '@/types';
import styles from '../articles.module.css';

export default function ArticleDetailPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const {
    data: article,
    isLoading: articleLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['article', slug],
    enabled: isAuthenticated && Boolean(slug),
    queryFn: async () => {
      const response = await api.getArticle(slug as string);

      if (!response.success || !response.data?.article) {
        throw new Error(response.message || 'Unable to load article');
      }

      return response.data.article;
    },
  });

  if (isLoading || !isAuthenticated) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
        <p className={styles.stateText}>Loading article...</p>
      </div>
    );
  }

  return (
    <AppLayout>
      {articleLoading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p className={styles.stateText}>Loading CMS article...</p>
        </div>
      ) : isError || !article ? (
        <div className={styles.errorState}>
          <BookOpen size={36} color="var(--color-primary)" />
          <p className={styles.stateTitle}>Article could not load</p>
          <p className={styles.stateText}>{error instanceof Error ? error.message : 'Please try again.'}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Link href="/articles">
              <Button type="button" variant="outline" size="sm">Back to articles</Button>
            </Link>
            <Button type="button" variant="primary" size="sm" onClick={() => refetch()}>Retry</Button>
          </div>
        </div>
      ) : (
        <article className={styles.detailShell}>
          <Link href="/articles" className={styles.backLink}>
            <ArrowLeft size={16} />
            Back to articles
          </Link>

          <header className={styles.articleHeader}>
            <div className={styles.metaRow}>
              {article.category ? (
                <Badge variant="info" size="sm">
                  {article.category}
                </Badge>
              ) : null}
              <span>
                <CalendarDays size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                {formatDate(article.publishedAt || article.createdAt)}
              </span>
              {article.generatedByAi ? (
                <span>
                  <Tag size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                  AI-generated, admin reviewed
                </span>
              ) : null}
            </div>

            <h1 className={styles.articleTitle}>{article.title}</h1>
            {article.excerpt ? <p className={styles.articleExcerpt}>{article.excerpt}</p> : null}

            {article.tags?.length ? (
              <div className={styles.tags}>
                {article.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>{tag}</span>
                ))}
              </div>
            ) : null}
          </header>

          {article.coverImageUrl ? (
            <figure className={styles.heroImage}>
              <img src={article.coverImageUrl} alt={article.title} />
            </figure>
          ) : null}

          <section className={styles.body}>
            {article.contentBlocks?.length ? (
              <div className={styles.bodyInner}>
                {article.contentBlocks.map((block, index) => (
                  <ContentBlock key={`${block.type}-${index}`} block={block} />
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <BookOpen size={36} color="var(--color-primary)" />
                <p className={styles.stateTitle}>Body content is not available</p>
                <p className={styles.stateText}>This CMS article is published, but it has no content blocks yet.</p>
              </div>
            )}
          </section>
        </article>
      )}
    </AppLayout>
  );
}

function ContentBlock({ block }: { block: ArticleContentBlock }) {
  switch (block.type) {
    case 'heading':
      return <Heading level={block.level} text={block.text || ''} />;
    case 'paragraph':
      return <p>{block.text}</p>;
    case 'quote':
      return <blockquote className={styles.quote}>{block.text}</blockquote>;
    case 'bullet_list':
      return (
        <ul className={styles.bulletList}>
          {(block.items || []).map((item) => (
            <li key={item}>
              <span className={styles.bullet}>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case 'image':
      if (!block.url) {
        return null;
      }

      return (
        <figure className={styles.contentImage}>
          <img src={block.url} alt={block.alt || ''} loading="lazy" />
          {block.caption ? <figcaption className={styles.caption}>{block.caption}</figcaption> : null}
        </figure>
      );
    case 'callout':
      return <aside className={styles.callout}>{block.text}</aside>;
    default:
      return block.text ? <p>{block.text}</p> : null;
  }
}

function Heading({ level, text }: { level?: number | null; text: string }) {
  const safeLevel = typeof level === 'number' ? Math.min(Math.max(Math.floor(level), 2), 4) : 2;

  if (safeLevel === 3) {
    return <h3>{text}</h3>;
  }

  if (safeLevel === 4) {
    return <h4>{text}</h4>;
  }

  return <h2>{text}</h2>;
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Recently published';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently published';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
