"use client";

import { useRef } from "react";
import Link from "next/link";
import { AnimatedProductMockupSection } from "@/components/landing/AnimatedProductMockupSection";
import { Button } from "@/components/landing-ui/button";

const videoUrl =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260319_015952_e1deeb12-8fb7-4071-a42a-60779fc64ab6.mp4";

export function MenorahHomeHero() {
  const heroRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={heroRef}
      data-menorah-home-ready
      className="relative min-h-[390svh] bg-background text-foreground sm:min-h-[430svh] lg:min-h-[460svh]"
    >
      <div className="sticky top-0 flex h-[100svh] min-h-[620px] flex-col overflow-hidden max-sm:min-h-[560px] relative">
        <video
          className="absolute inset-0 z-0 h-full w-full object-cover"
          src={videoUrl}
          muted
          autoPlay
          loop
          playsInline
          aria-hidden="true"
        />
        <HeroSection />
        <AnimatedProductMockupSection scrollRootRef={heroRef} />
      </div>
    </section>
  );
}

function HeroSection() {
  return (
    <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-[clamp(1rem,4vw,3rem)] pb-[clamp(4rem,9vh,7rem)] pt-[clamp(5rem,10vh,7.5rem)]">
      <section className="relative z-10 flex w-full max-w-[min(68rem,94vw)] flex-col items-center">
        <h1 className="text-center font-display text-[clamp(2.65rem,7.4vw,5.15rem)] leading-[0.96] tracking-tight text-foreground">
          We are Menorah, the world's firsts Mental health app for men
        </h1>

        <p className="mt-[clamp(1rem,2.4vw,1.35rem)] max-w-[min(42rem,88vw)] text-center font-body text-[clamp(0.95rem,1.6vw,1.125rem)] leading-relaxed text-muted-foreground">
          A mental health platform built for men in India to understand stress, burnout, anxiety, relationships,
          and help-seeking with private support and practical resources.
        </p>

        <div className="mt-[clamp(1.15rem,2.8vw,1.6rem)] flex flex-wrap items-center justify-center gap-[clamp(0.65rem,1.6vw,0.9rem)]">
          <Button asChild className="rounded-full px-[clamp(1.25rem,3vw,1.6rem)] py-5 font-body text-sm font-medium">
            <Link href="/register">Book a demo</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="rounded-full border border-primary/25 bg-background/70 px-[clamp(1.25rem,3vw,1.6rem)] py-5 font-body text-sm font-medium backdrop-blur"
          >
            <Link href="/articles">Read articles</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
