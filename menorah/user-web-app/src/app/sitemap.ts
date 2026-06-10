import type { MetadataRoute } from "next";
import { getArticles, type Article } from "@/lib/articles";
import { getPublicWebUrl } from "@/lib/site";

export const revalidate = 3600;

const STATIC_ROUTES = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/articles", priority: 0.9, changeFrequency: "daily" },
  { path: "/about-us", priority: 0.7, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.65, changeFrequency: "monthly" },
  { path: "/contact-us", priority: 0.55, changeFrequency: "monthly" },
  { path: "/privacy-policy", priority: 0.35, changeFrequency: "yearly" },
  { path: "/terms-and-conditions", priority: 0.35, changeFrequency: "yearly" },
  { path: "/account-deletion", priority: 0.25, changeFrequency: "yearly" }
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const articles = await getPublishedArticlesForSitemap();

  return [
    ...STATIC_ROUTES.map((route) => ({
      url: getPublicWebUrl(route.path),
      lastModified: now,
      changeFrequency: route.changeFrequency,
      priority: route.priority
    })),
    ...articles.map((article) => ({
      url: getPublicWebUrl(`/articles/${article.slug}`),
      lastModified: getArticleLastModified(article),
      changeFrequency: "monthly" as const,
      priority: 0.8
    }))
  ];
}

async function getPublishedArticlesForSitemap() {
  const articles: Article[] = [];
  const limit = 50;
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage && page <= 100) {
    const result = await getArticles({ page, limit });
    articles.push(...result.articles.filter((article) => Boolean(article.slug)));
    hasNextPage = result.pagination.hasNextPage;
    page += 1;
  }

  return articles;
}

function getArticleLastModified(article: Article) {
  const value = article.updatedAt || article.publishedAt || article.createdAt;
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
