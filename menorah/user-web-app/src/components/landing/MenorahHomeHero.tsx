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
      <div className="sticky top-0 flex h-[100svh] min-h-[clamp(35rem,58vw,49rem)] flex-col overflow-hidden max-sm:min-h-[34rem] relative">
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
    <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-[var(--landing-page-x)] pb-[clamp(4rem,9vh,8rem)] pt-[clamp(5rem,11vh,8.5rem)]">
      <section className="relative z-10 flex w-full max-w-[min(78rem,94vw)] flex-col items-center">
        <h1 className="text-center font-display text-[length:var(--landing-hero-title)] leading-[0.96] tracking-tight text-foreground">
          We are Menorah, the world's firsts Mental health app for men
        </h1>

        <p className="mt-[clamp(1rem,2.4vw,1.75rem)] max-w-[min(48rem,88vw)] text-center font-body text-[length:var(--landing-hero-body)] leading-relaxed text-muted-foreground">
          A mental health platform built for men in India to understand stress, burnout, anxiety, relationships,
          and help-seeking with private support and practical resources.
        </p>

        <div className="mt-[clamp(1.15rem,2.8vw,2rem)] flex flex-wrap items-center justify-center gap-[clamp(0.65rem,1.6vw,1rem)]">
          <Button asChild className="min-h-[var(--landing-button-h)] rounded-full px-[var(--landing-button-x)] py-3 font-body text-[length:var(--landing-button-text)] font-medium">
            <Link href="/register">Book a demo</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="min-h-[var(--landing-button-h)] rounded-full border border-primary/25 bg-background/70 px-[var(--landing-button-x)] py-3 font-body text-[length:var(--landing-button-text)] font-medium backdrop-blur"
          >
            <Link href="/articles">Read articles</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
