import { MenorahNavbar } from "@/components/site/MenorahNavbar";

export default function ArticlesLoading() {
  return (
    <div className="min-h-screen bg-menorah-page text-foreground">
      <MenorahNavbar elevated />
      <main className="px-6 pb-16 pt-12 md:px-10 lg:px-20">
        <section className="mx-auto max-w-6xl">
          <div className="h-10 w-40 animate-pulse rounded-full bg-background/80" />
          <div className="mt-6 h-14 max-w-xl animate-pulse rounded-xl bg-background/80" />
          <div className="mt-5 h-6 max-w-2xl animate-pulse rounded-lg bg-background/70" />
          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="overflow-hidden rounded-2xl border border-menorah-cream bg-background shadow-sm">
                <div className="aspect-[16/10] animate-pulse bg-menorah-cream/70" />
                <div className="space-y-4 p-5">
                  <div className="h-4 w-28 animate-pulse rounded bg-menorah-page" />
                  <div className="h-7 w-full animate-pulse rounded bg-menorah-page" />
                  <div className="h-16 w-full animate-pulse rounded bg-menorah-page" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
