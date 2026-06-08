/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarDays, CheckCircle2, Quote, Tag } from "lucide-react";
import { MenorahFooter } from "@/components/site/MenorahFooter";
import { MenorahNavbar } from "@/components/site/MenorahNavbar";
import { getArticleBySlug, type Article, type ArticleContentBlock } from "@/lib/articles";

type ArticlePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    return {
      title: "Article not found | Menorah"
    };
  }

  const title = article.seoTitle || article.title;
  const description = article.seoDescription || article.excerpt || "Read this Menorah article.";

  return {
    title: `${title} | Menorah`,
    description,
    alternates: {
      canonical: article.canonicalUrl || `/articles/${article.slug}`
    },
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime: article.publishedAt || article.createdAt,
      modifiedTime: article.updatedAt,
      images: article.coverImageUrl
        ? [
            {
              url: article.coverImageUrl,
              alt: article.title
            }
          ]
        : undefined
    }
  };
}

export default async function ArticleDetailPage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-menorah-page text-foreground">
      <MenorahNavbar elevated />
      <main className="px-6 pb-16 pt-10 md:px-10 lg:px-20">
        <article className="mx-auto max-w-4xl">
          <Link href="/articles" className="inline-flex items-center gap-2 text-sm font-semibold text-menorah-green transition hover:text-menorah-olive">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to articles
          </Link>

          <header className="mt-8 rounded-[2rem] border border-menorah-cream bg-background p-6 shadow-dashboard md:p-10">
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

            <h1 className="mt-5 font-display text-4xl leading-tight tracking-[0.02em] md:text-6xl">{article.title}</h1>
            {article.excerpt ? <p className="mt-6 text-lg leading-8 text-foreground/72">{article.excerpt}</p> : null}

            {article.tags.length ? (
              <div className="mt-7 flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-menorah-page px-3 py-1.5 text-xs font-semibold text-foreground/64">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </header>

          {article.coverImageUrl ? (
            <figure className="mt-8 overflow-hidden rounded-[2rem] border border-menorah-cream bg-background shadow-dashboard">
              <img src={article.coverImageUrl} alt={article.title} className="max-h-[620px] w-full object-cover" />
            </figure>
          ) : null}

          <ArticleBody article={article} />
        </article>

        <MenorahFooter />
      </main>
    </div>
  );
}

function ArticleBody({ article }: { article: Article }) {
  if (!article.contentBlocks.length) {
    return (
      <section className="mt-8 rounded-[2rem] border border-menorah-cream bg-background p-6 text-center shadow-dashboard md:p-10">
        <BookOpen className="mx-auto h-10 w-10 text-menorah-green/60" aria-hidden="true" />
        <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-foreground/70">
          This article is published, but the body content is not available yet.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-[2rem] border border-menorah-cream bg-background p-6 shadow-dashboard md:p-10">
      <div className="mx-auto max-w-3xl space-y-7">
        {article.contentBlocks.map((block, index) => (
          <ArticleContentBlockRenderer key={`${block.type}-${index}`} block={block} />
        ))}
      </div>
    </section>
  );
}

function ArticleContentBlockRenderer({ block }: { block: ArticleContentBlock }) {
  switch (block.type) {
    case "heading":
      return <ArticleHeading level={block.level} text={block.text} />;
    case "paragraph":
      return <p className="text-[17px] leading-8 text-foreground/76">{block.text}</p>;
    case "quote":
      return (
        <blockquote className="rounded-2xl border-l-4 border-menorah-green bg-menorah-page/70 p-5 text-xl leading-9 text-foreground">
          <Quote className="mb-3 h-5 w-5 text-menorah-green" aria-hidden="true" />
          {block.text}
        </blockquote>
      );
    case "bullet_list":
      return (
        <ul className="space-y-3 text-[17px] leading-8 text-foreground/76">
          {block.items.map((item) => (
            <li key={item} className="flex gap-3">
              <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-menorah-green" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "image":
      return (
        <figure className="overflow-hidden rounded-2xl border border-menorah-cream bg-menorah-page/45">
          <img src={block.url} alt={block.alt || ""} className="w-full object-cover" loading="lazy" />
          {block.caption ? <figcaption className="px-4 py-3 text-sm text-foreground/58">{block.caption}</figcaption> : null}
        </figure>
      );
    case "callout":
      return (
        <aside className="rounded-2xl border border-menorah-green/12 bg-menorah-green/10 p-5 text-base font-medium leading-8 text-foreground/78">
          {block.text}
        </aside>
      );
    case "unknown":
      return block.text ? <p className="text-[17px] leading-8 text-foreground/76">{block.text}</p> : null;
  }
}

function ArticleHeading({ level, text }: { level?: number; text: string }) {
  const safeLevel = typeof level === "number" ? Math.min(Math.max(Math.floor(level), 2), 4) : 2;

  if (safeLevel === 3) {
    return <h3 className="pt-3 text-2xl font-semibold leading-tight text-foreground">{text}</h3>;
  }

  if (safeLevel === 4) {
    return <h4 className="pt-2 text-xl font-semibold leading-tight text-foreground">{text}</h4>;
  }

  return <h2 className="pt-4 font-display text-3xl leading-tight tracking-[0.02em] text-foreground">{text}</h2>;
}

function formatArticleDate(value: string | undefined) {
  if (!value) {
    return "Recently published";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently published";
  }

  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}
