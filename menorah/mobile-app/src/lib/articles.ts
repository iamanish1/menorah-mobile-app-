import { ENV } from '@/lib/env';
import type { Article } from '@/types/article';

export function isPublishedArticle(article: Article | null | undefined): article is Article {
  if (!article?.slug?.trim()) {
    return false;
  }

  // Public article routes always return this status. Accept legacy payloads
  // without it, but never render a known draft/rejected record in the app.
  return !article.status || String(article.status).toLowerCase() === 'published';
}

export function getCanonicalArticleUrl(slug: string) {
  const normalizedSlug = slug.trim();
  const baseUrl = ENV.ARTICLE_CANONICAL_BASE_URL.replace(/\/+$/, '');

  return normalizedSlug
    ? `${baseUrl}/articles/${encodeURIComponent(normalizedSlug)}`
    : `${baseUrl}/articles`;
}
