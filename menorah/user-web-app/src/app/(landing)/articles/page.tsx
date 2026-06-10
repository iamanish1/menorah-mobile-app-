/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BookOpen, CalendarDays, Search, Tag } from "lucide-react";
import { MenorahFooter } from "@/components/site/MenorahFooter";
import { MenorahNavbar } from "@/components/site/MenorahNavbar";
import { getArticleCategories, getArticles, type Article } from "@/lib/articles";

export const metadata: Metadata = {
  title: "Men's Mental Health Articles",
  description:
    "Read practical Menorah articles for men in India on stress, burnout, anxiety, relationships, counselling stigma, self-help tools, and private mental health support.",
  alternates: {
    canonical: "/articles"
  },
  openGraph: {
    title: "Men's Mental Health Articles | Menorah Health",
    description:
      "Practical mental health articles for Indian men navigating stress, burnout, anxiety, relationships, counselling stigma, and help-seeking.",
    url: "/articles",
    type: "website"
  }
};

type ArticlesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const ARTICLES_PER_PAGE = 10;

export default async function ArticlesPage({ searchParams }: ArticlesPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const q = getSearchValue(resolvedSearchParams, "q");
  const category = getSearchValue(resolvedSearchParams, "category");
  const page = parsePositiveInteger(getSearchValue(resolvedSearchParams, "page"), 1);
  const [{ articles, pagination }, categories] = await Promise.all([
    getArticles({ page, limit: ARTICLES_PER_PAGE, category, q }),
    getArticleCategories()
  ]);
  const categoryOptions = getCategoryOptions(categories, category);
  const hasActiveFilters = Boolean(q || category);

  return (
    <div className="min-h-screen bg-menorah-page text-foreground">
      <MenorahNavbar elevated />
      <main className="px-6 pb-16 pt-12 md:px-10 lg:px-20">
        <section className="mx-auto max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-menorah-green/10 bg-background/75 px-4 py-2 text-sm font-semibold text-menorah-green shadow-sm">
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                Menorah Journal
              </div>
              <h1 className="mt-6 font-display text-4xl leading-tight tracking-[0.04em] md:text-6xl">Articles</h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-foreground/72 md:text-lg">
                Clear, practical mental health reading for men, built to support the same private path inside Menorah.
              </p>
            </div>

            <form
              action="/articles"
              className="rounded-2xl border border-menorah-cream bg-background/85 p-3 shadow-dashboard sm:flex sm:items-center sm:gap-3"
            >
              <label className="sr-only" htmlFor="article-search">
                Search articles
              </label>
              <div className="flex min-h-12 flex-1 items-center gap-3 rounded-xl border border-foreground/8 bg-white px-4">
                <Search className="h-5 w-5 shrink-0 text-foreground/42" aria-hidden="true" />
                <input
                  id="article-search"
                  name="q"
                  defaultValue={q}
                  placeholder="Search articles"
                  className="min-h-11 w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-foreground/38"
                />
              </div>
              {category ? <input type="hidden" name="category" value={category} /> : null}
              <button
                type="submit"
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 sm:mt-0 sm:w-auto"
              >
                Search
              </button>
            </form>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <CategoryPill href={buildArticlesHref({ q })} active={!category}>
              All articles
            </CategoryPill>
            {categoryOptions.map((item) => (
              <CategoryPill key={item} href={buildArticlesHref({ q, category: item })} active={category === item}>
                {item}
              </CategoryPill>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-6xl">
          {articles.length ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {articles.map((article) => (
                <ArticleCard key={article.id ?? article._id ?? article.slug} article={article} />
              ))}
            </div>
          ) : (
            <EmptyArticlesState hasActiveFilters={hasActiveFilters} />
          )}

          {articles.length ? (
            <PaginationControls page={pagination.page} hasNextPage={pagination.hasNextPage} hasPreviousPage={pagination.hasPreviousPage} q={q} category={category} />
          ) : null}

          <ArticleLandingCta />
        </section>

        <MenorahFooter />
      </main>
    </div>
  );
}

function ArticleLandingCta() {
  return (
    <section className="mt-14 rounded-[2rem] border border-menorah-green/12 bg-background p-6 shadow-dashboard md:p-8">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-menorah-olive">Need more than reading?</p>
          <h2 className="mt-3 text-2xl font-semibold leading-tight text-foreground">Move from articles to private support.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-foreground/68">
            Menorah combines practical mental-health education with private support paths for men in India who want help with stress, burnout, anxiety, relationships, or difficult conversations.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Create account
          </Link>
          <Link
            href="/contact-us"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-menorah-green/20 bg-background px-5 text-sm font-semibold text-foreground/72 transition hover:text-foreground"
          >
            Contact Menorah
          </Link>
        </div>
      </div>
    </section>
  );
}

function ArticleCard({ article }: { article: Article }) {
  const href = `/articles/${article.slug}`;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-menorah-cream bg-background shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-dashboard">
      <Link href={href} className="block focus:outline-none focus:ring-4 focus:ring-menorah-green/15" aria-label={`Read ${article.title}`}>
        <div className="relative aspect-[16/10] overflow-hidden bg-menorah-cream/60">
          {article.coverImageUrl ? (
            <img
              src={article.coverImageUrl}
              alt={article.title}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,hsl(var(--menorah-green)/0.18),transparent_36%),linear-gradient(135deg,hsl(var(--menorah-cream)),hsl(var(--background)))]">
              <BookOpen className="h-12 w-12 text-menorah-green/55" aria-hidden="true" />
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-menorah-olive">
          {article.category ? (
            <span className="inline-flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              {article.category}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 text-foreground/48">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {formatArticleDate(article.publishedAt ?? article.createdAt)}
          </span>
        </div>

        <h2 className="mt-4 text-xl font-semibold leading-tight text-foreground">
          <Link href={href} className="transition hover:text-menorah-green">
            {article.title}
          </Link>
        </h2>

        {article.excerpt ? <p className="mt-3 line-clamp-3 text-sm leading-7 text-foreground/68">{article.excerpt}</p> : null}

        {article.tags.length ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {article.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full bg-menorah-page px-3 py-1 text-xs font-medium text-foreground/64">
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <Link href={href} className="mt-auto inline-flex w-fit items-center gap-2 pt-6 text-sm font-semibold text-menorah-green">
          Read article
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function CategoryPill({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold transition ${
        active
          ? "border-menorah-green bg-menorah-green text-white shadow-[0_14px_30px_rgba(46,72,46,0.14)]"
          : "border-menorah-green/12 bg-background/80 text-foreground/72 hover:border-menorah-green/35 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

function EmptyArticlesState({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  return (
    <div className="rounded-[2rem] border border-menorah-cream bg-background px-6 py-14 text-center shadow-dashboard">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-menorah-page text-menorah-green">
        <BookOpen className="h-8 w-8" aria-hidden="true" />
      </div>
      <h2 className="mt-6 text-2xl font-semibold">{hasActiveFilters ? "No matching articles yet" : "Articles are coming soon"}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-foreground/68">
        {hasActiveFilters
          ? "Try clearing your search or choosing another category."
          : "When new Menorah articles are published, they will appear here automatically."}
      </p>
      {hasActiveFilters ? (
        <Link
          href="/articles"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
        >
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}

function PaginationControls({
  page,
  hasNextPage,
  hasPreviousPage,
  q,
  category
}: {
  page: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  q?: string;
  category?: string;
}) {
  if (!hasNextPage && !hasPreviousPage) {
    return null;
  }

  return (
    <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
      {hasPreviousPage ? (
        <Link
          href={buildArticlesHref({ page: page - 1, q, category })}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-menorah-green/20 bg-background px-5 text-sm font-semibold text-foreground/72 transition hover:text-foreground"
        >
          Previous
        </Link>
      ) : null}
      <span className="px-3 text-sm font-semibold text-foreground/48">Page {page}</span>
      {hasNextPage ? (
        <Link
          href={buildArticlesHref({ page: page + 1, q, category })}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-menorah-green px-5 text-sm font-semibold text-white transition hover:bg-menorah-olive"
        >
          Next
        </Link>
      ) : null}
    </div>
  );
}

function buildArticlesHref({ page, q, category }: { page?: number; q?: string; category?: string }) {
  const params = new URLSearchParams();

  if (page && page > 1) {
    params.set("page", String(page));
  }

  if (q) {
    params.set("q", q);
  }

  if (category) {
    params.set("category", category);
  }

  const queryString = params.toString();
  return queryString ? `/articles?${queryString}` : "/articles";
}

function getCategoryOptions(categories: string[], activeCategory?: string) {
  if (!activeCategory || categories.includes(activeCategory)) {
    return categories;
  }

  return [activeCategory, ...categories];
}

function getSearchValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  const firstValue = Array.isArray(value) ? value[0] : value;

  return firstValue?.trim() || undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatArticleDate(value: string | undefined) {
  if (!value) {
    return "Recently";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}
