import Link from "next/link";
import { BookOpen } from "lucide-react";
import { MenorahFooter } from "@/components/site/MenorahFooter";
import { MenorahNavbar } from "@/components/site/MenorahNavbar";

export default function ArticleNotFound() {
  return (
    <div className="min-h-screen bg-menorah-page text-foreground">
      <MenorahNavbar elevated />
      <main className="px-6 pb-16 pt-12 md:px-10 lg:px-20">
        <section className="mx-auto max-w-3xl rounded-[2rem] border border-menorah-cream bg-background px-6 py-14 text-center shadow-dashboard md:px-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-menorah-page text-menorah-green">
            <BookOpen className="h-8 w-8" aria-hidden="true" />
          </div>
          <h1 className="mt-6 font-display text-4xl leading-tight tracking-[0.04em]">Article not found</h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-foreground/70">
            This article may have moved, or it may not be published yet.
          </p>
          <Link
            href="/articles"
            className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
          >
            Back to articles
          </Link>
        </section>
        <MenorahFooter />
      </main>
    </div>
  );
}
