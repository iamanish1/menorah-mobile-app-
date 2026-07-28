const DEFAULT_ARTICLE_CANONICAL_BASE_URL = 'https://www.menorah.me';

const normalizeBaseUrl = (value) => {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return '';
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(rawValue) && !/^https?:\/\//i.test(rawValue)) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;

  try {
    const url = new URL(withProtocol);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return '';
    }

    return url.origin.replace(/\/+$/, '');
  } catch {
    return '';
  }
};

/**
 * The API origin is deliberately not used here.  PUBLIC_WEB_BASE_URL is also
 * used by Social Studio to construct URLs for files served by the API, while
 * articles must always canonically resolve to the public landing site.
 */
const getArticleCanonicalBaseUrl = () => {
  const configuredBaseUrl =
    process.env.ARTICLE_CANONICAL_BASE_URL ||
    process.env.PUBLIC_LANDING_BASE_URL ||
    process.env.FRONTEND_WWW_URL;

  const normalizedConfiguredBaseUrl = normalizeBaseUrl(configuredBaseUrl);

  if (normalizedConfiguredBaseUrl) {
    return normalizedConfiguredBaseUrl;
  }

  // Retain a convenient local-development fallback without accidentally using
  // the API domain in production (where PUBLIC_WEB_BASE_URL serves Social
  // Studio media, not HTML articles).
  if (process.env.NODE_ENV !== 'production') {
    const localBaseUrl = normalizeBaseUrl(process.env.PUBLIC_WEB_BASE_URL);

    if (localBaseUrl) {
      return localBaseUrl;
    }
  }

  return DEFAULT_ARTICLE_CANONICAL_BASE_URL;
};

const buildArticleCanonicalUrl = (slug) => {
  const normalizedSlug = String(slug || '').trim();

  if (!normalizedSlug) {
    return '';
  }

  return `${getArticleCanonicalBaseUrl()}/articles/${encodeURIComponent(normalizedSlug)}`;
};

module.exports = {
  DEFAULT_ARTICLE_CANONICAL_BASE_URL,
  buildArticleCanonicalUrl,
  getArticleCanonicalBaseUrl,
  normalizeBaseUrl
};
