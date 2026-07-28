const FALLBACK_PUBLIC_WEB_BASE_URL = "https://app.menorah.me";
const FALLBACK_ARTICLE_CANONICAL_BASE_URL = "https://www.menorah.me";

export const SITE_NAME = "Menorah Health";
export const EDITORIAL_REVIEWER_NAME = "Menorah Editorial Team";

export function getPublicWebBaseUrl() {
  const rawValue =
    process.env.PUBLIC_WEB_BASE_URL ||
    process.env.NEXT_PUBLIC_WEB_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    FALLBACK_PUBLIC_WEB_BASE_URL;

  const normalized = String(rawValue).trim();
  const withProtocol = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
  return withProtocol.replace(/\/+$/, "");
}

export function getPublicWebUrl(path = "/") {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${getPublicWebBaseUrl()}${safePath}`;
}

/**
 * Article pages are published once and shared from the public landing site.
 * Keep that origin separate from the signed-in app origin so the same article
 * never advertises multiple canonical URLs across Menorah surfaces.
 */
export function getArticleCanonicalBaseUrl() {
  const rawValue =
    process.env.ARTICLE_CANONICAL_BASE_URL ||
    process.env.NEXT_PUBLIC_ARTICLE_CANONICAL_BASE_URL ||
    process.env.PUBLIC_LANDING_BASE_URL ||
    process.env.NEXT_PUBLIC_LANDING_BASE_URL;

  if (!rawValue) {
    // Local and legacy deployments can continue to use their configured web
    // origin until ARTICLE_CANONICAL_BASE_URL is supplied explicitly.
    return process.env.NODE_ENV === "production"
      ? FALLBACK_ARTICLE_CANONICAL_BASE_URL
      : getPublicWebBaseUrl();
  }

  const normalized = String(rawValue).trim();

  if (/^[a-z][a-z\d+.-]*:/i.test(normalized) && !/^https?:\/\//i.test(normalized)) {
    return process.env.NODE_ENV === "production"
      ? FALLBACK_ARTICLE_CANONICAL_BASE_URL
      : getPublicWebBaseUrl();
  }

  const withProtocol = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;

  try {
    const url = new URL(withProtocol);
    return url.origin.replace(/\/+$/, "");
  } catch {
    return process.env.NODE_ENV === "production"
      ? FALLBACK_ARTICLE_CANONICAL_BASE_URL
      : getPublicWebBaseUrl();
  }
}

export function getArticleCanonicalUrl(slug: string) {
  const normalizedSlug = slug.trim();

  if (!normalizedSlug) {
    return `${getArticleCanonicalBaseUrl()}/articles`;
  }

  return `${getArticleCanonicalBaseUrl()}/articles/${encodeURIComponent(normalizedSlug)}`;
}
