const FALLBACK_PUBLIC_WEB_BASE_URL = "https://app.menorah.me";

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
