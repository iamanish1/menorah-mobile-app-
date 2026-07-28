import type { Article } from '@/types';

const FALLBACK_ARTICLE_CANONICAL_BASE_URL = 'https://www.menorah.me';

/**
 * Every reader surface consumes the public articles endpoint. Retain a small
 * local guard so a misrouted API response can never display a draft or an
 * item without the canonical slug identifier.
 */
export function isPublishedArticle(article: Article | null | undefined): article is Article {
  if (!article?.slug?.trim()) {
    return false;
  }

  return !article.status || article.status.toLowerCase() === 'published';
}

export function getCanonicalArticleUrl(slug: string) {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_ARTICLE_CANONICAL_BASE_URL?.trim();
  const rawBaseUrl = configuredBaseUrl || FALLBACK_ARTICLE_CANONICAL_BASE_URL;

  if (/^[a-z][a-z\d+.-]*:/i.test(rawBaseUrl) && !/^https?:\/\//i.test(rawBaseUrl)) {
    return `${FALLBACK_ARTICLE_CANONICAL_BASE_URL}/articles/${encodeURIComponent(slug.trim())}`;
  }

  const withProtocol = /^https?:\/\//i.test(rawBaseUrl) ? rawBaseUrl : `https://${rawBaseUrl}`;

  try {
    const baseUrl = new URL(withProtocol);
    const normalizedSlug = slug.trim();
    return normalizedSlug
      ? `${baseUrl.origin}/articles/${encodeURIComponent(normalizedSlug)}`
      : `${baseUrl.origin}/articles`;
  } catch {
    return `${FALLBACK_ARTICLE_CANONICAL_BASE_URL}/articles/${encodeURIComponent(slug.trim())}`;
  }
}
