export const ARTICLE_REVALIDATE_SECONDS = 60;

export type ArticleContentBlock =
  | {
      type: "heading";
      text: string;
      level?: number;
    }
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "quote";
      text: string;
    }
  | {
      type: "bullet_list";
      items: string[];
    }
  | {
      type: "image";
      url: string;
      alt?: string;
      caption?: string;
    }
  | {
      type: "callout";
      text: string;
    }
  | {
      type: "unknown";
      originalType: string;
      text?: string;
      items?: string[];
      level?: number;
      url?: string;
      alt?: string;
      caption?: string;
    };

export type Article = {
  id?: string;
  _id?: string;
  title: string;
  slug: string;
  excerpt?: string;
  category?: string;
  tags: string[];
  coverImageUrl?: string;
  coverImagePublicId?: string;
  imagePrompt?: string;
  contentBlocks: ArticleContentBlock[];
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  status?: string;
  generatedByAi?: boolean;
  reviewedByHuman?: boolean;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ArticlePagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type ArticlesListResult = {
  articles: Article[];
  pagination: ArticlePagination;
};

export type GetArticlesParams = {
  page?: number;
  limit?: number;
  category?: string;
  q?: string;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

export async function getArticles({
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT,
  category,
  q
}: GetArticlesParams = {}): Promise<ArticlesListResult> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.max(1, Math.floor(limit));
  const url = buildApiUrl("/api/articles", {
    page: String(safePage),
    limit: String(safeLimit),
    category: category?.trim() || undefined,
    q: q?.trim() || undefined
  });

  if (!url) {
    return createEmptyArticleList(safePage, safeLimit);
  }

  const response = await fetchArticleJson(url);

  if (!response) {
    return createEmptyArticleList(safePage, safeLimit);
  }

  const articles = extractArticles(response);
  const pagination = extractPagination(response, articles.length, safePage, safeLimit);

  return {
    articles,
    pagination
  };
}

export async function getArticleCategories(): Promise<string[]> {
  const url = buildApiUrl("/api/articles/categories/list");

  if (!url) {
    return [];
  }

  const response = await fetchArticleJson(url);

  if (!response) {
    return [];
  }

  return extractCategories(response);
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const safeSlug = slug.trim();

  if (!safeSlug) {
    return null;
  }

  const url = buildApiUrl(`/api/articles/${encodeURIComponent(safeSlug)}`);

  if (!url) {
    return null;
  }

  const response = await fetchArticleJson(url);

  if (!response) {
    return null;
  }

  return extractArticle(response);
}

function getApiBaseUrl() {
  const baseUrl =
    process.env.MENORAH_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (!baseUrl) {
    return null;
  }

  return baseUrl.replace(/\/+$/, "");
}

function buildApiUrl(path: string, params?: Record<string, string | undefined>) {
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    return null;
  }

  try {
    const apiPath = baseUrl.endsWith("/api") && path.startsWith("/api/") ? path.slice(4) : path;
    const url = new URL(`${baseUrl}${apiPath}`);

    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });

    return url.toString();
  } catch {
    return null;
  }
}

async function fetchArticleJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      },
      next: {
        revalidate: ARTICLE_REVALIDATE_SECONDS
      }
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

function extractArticles(response: unknown): Article[] {
  const directArray = normalizeArticleArray(response);

  if (directArray.length) {
    return directArray;
  }

  if (!isRecord(response)) {
    return [];
  }

  const data = response.data;

  if (Array.isArray(data)) {
    return normalizeArticleArray(data);
  }

  if (isRecord(data)) {
    const fromData = firstNonEmptyArticleArray(data.articles, data.docs, data.items);

    if (fromData.length) {
      return fromData;
    }
  }

  return firstNonEmptyArticleArray(response.articles, response.docs, response.items);
}

function extractArticle(response: unknown): Article | null {
  const directArticle = normalizeArticle(response);

  if (directArticle) {
    return directArticle;
  }

  if (!isRecord(response)) {
    return null;
  }

  const data = response.data;

  if (isRecord(data)) {
    return normalizeArticle(data.article) || normalizeArticle(data.item) || normalizeArticle(data);
  }

  return normalizeArticle(response.article) || normalizeArticle(response.item);
}

function extractCategories(response: unknown): string[] {
  const directCategories = normalizeStringArray(response);

  if (directCategories.length) {
    return directCategories;
  }

  if (!isRecord(response)) {
    return [];
  }

  const data = response.data;

  if (Array.isArray(data)) {
    return normalizeStringArray(data);
  }

  if (isRecord(data)) {
    const fromData = firstNonEmptyStringArray(data.categories, data.items, data.data);

    if (fromData.length) {
      return fromData;
    }
  }

  return firstNonEmptyStringArray(response.categories, response.items);
}

function extractPagination(response: unknown, articleCount: number, fallbackPage: number, fallbackLimit: number): ArticlePagination {
  const candidates = getPaginationCandidates(response);
  const source = candidates.find(Boolean) ?? {};
  const total = readNumber(source, ["total", "totalCount", "count", "totalDocs"]) ?? articleCount;
  const page = readNumber(source, ["page", "currentPage"]) ?? fallbackPage;
  const limit = readNumber(source, ["limit", "perPage", "pageSize"]) ?? fallbackLimit;
  const totalPages =
    readNumber(source, ["totalPages", "pages", "pageCount"]) ?? Math.max(1, Math.ceil(total / Math.max(limit, 1)));
  const hasNextPage = readBoolean(source, ["hasNextPage", "hasNext"]) ?? page < totalPages;
  const hasPreviousPage = readBoolean(source, ["hasPreviousPage", "hasPrevPage", "hasPrevious"]) ?? page > 1;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage,
    hasPreviousPage
  };
}

function getPaginationCandidates(response: unknown): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];

  if (isRecord(response)) {
    candidates.push(response);

    if (isRecord(response.pagination)) {
      candidates.push(response.pagination);
    }

    if (isRecord(response.meta)) {
      candidates.push(response.meta);
    }

    if (isRecord(response.data)) {
      candidates.push(response.data);

      if (isRecord(response.data.pagination)) {
        candidates.push(response.data.pagination);
      }

      if (isRecord(response.data.meta)) {
        candidates.push(response.data.meta);
      }
    }
  }

  return candidates;
}

function normalizeArticleArray(value: unknown): Article[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeArticle).filter((article): article is Article => Boolean(article));
}

function normalizeArticle(value: unknown): Article | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = toOptionalString(value.id);
  const mongoId = toOptionalString(value._id);
  const title = toOptionalString(value.title) || "Untitled article";
  const slug = toOptionalString(value.slug) || id || mongoId;

  if (!slug) {
    return null;
  }

  return {
    id,
    _id: mongoId,
    title,
    slug,
    excerpt: toOptionalString(value.excerpt),
    category: toOptionalString(value.category),
    tags: normalizeStringArray(value.tags),
    coverImageUrl: toOptionalString(value.coverImageUrl),
    coverImagePublicId: toOptionalString(value.coverImagePublicId),
    imagePrompt: toOptionalString(value.imagePrompt),
    contentBlocks: normalizeContentBlocks(value.contentBlocks),
    seoTitle: toOptionalString(value.seoTitle),
    seoDescription: toOptionalString(value.seoDescription),
    canonicalUrl: toOptionalString(value.canonicalUrl),
    status: toOptionalString(value.status),
    generatedByAi: toOptionalBoolean(value.generatedByAi),
    reviewedByHuman: toOptionalBoolean(value.reviewedByHuman),
    publishedAt: toOptionalString(value.publishedAt),
    createdAt: toOptionalString(value.createdAt),
    updatedAt: toOptionalString(value.updatedAt)
  };
}

function normalizeContentBlocks(value: unknown): ArticleContentBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((block): ArticleContentBlock | null => {
      if (!isRecord(block)) {
        return null;
      }

      const type = toOptionalString(block.type);

      if (!type) {
        return null;
      }

      if (type === "bullet_list") {
        return {
          type,
          items: normalizeStringArray(block.items)
        };
      }

      if (type === "image") {
        const url = toOptionalString(block.url);

        if (!url) {
          return null;
        }

        return {
          type,
          url,
          alt: toOptionalString(block.alt),
          caption: toOptionalString(block.caption)
        };
      }

      if (type === "heading") {
        return {
          type,
          text: toOptionalString(block.text) || "",
          level: toOptionalNumber(block.level)
        };
      }

      if (type === "paragraph" || type === "quote" || type === "callout") {
        return {
          type,
          text: toOptionalString(block.text) || ""
        };
      }

      return {
        type: "unknown",
        originalType: type,
        text: toOptionalString(block.text),
        items: normalizeStringArray(block.items),
        level: toOptionalNumber(block.level),
        url: toOptionalString(block.url),
        alt: toOptionalString(block.alt),
        caption: toOptionalString(block.caption)
      };
    })
    .filter((block): block is ArticleContentBlock => Boolean(block));
}

function firstNonEmptyArticleArray(...values: unknown[]) {
  for (const value of values) {
    const articles = normalizeArticleArray(value);

    if (articles.length) {
      return articles;
    }
  }

  return [];
}

function firstNonEmptyStringArray(...values: unknown[]) {
  for (const value of values) {
    const items = normalizeStringArray(value);

    if (items.length) {
      return items;
    }
  }

  return [];
}

function createEmptyArticleList(page: number, limit: number): ArticlesListResult {
  return {
    articles: [],
    pagination: {
      page,
      limit,
      total: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false
    }
  };
}

function readNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const numberValue = toOptionalNumber(source[key]);

    if (typeof numberValue === "number") {
      return numberValue;
    }
  }

  return undefined;
}

function readBoolean(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const booleanValue = toOptionalBoolean(source[key]);

    if (typeof booleanValue === "boolean") {
      return booleanValue;
    }
  }

  return undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function toOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function toOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
