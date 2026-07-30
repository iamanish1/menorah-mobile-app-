"use client";

import type { CSSProperties } from "react";
import { useRef } from "react";
import Link from "next/link";
import { AnimatedProductMockupSection } from "@/components/landing/AnimatedProductMockupSection";
import { usePrefersReducedMotion, useScrollProgress } from "@/components/landing/useLandingMotion";
import { Button } from "@/components/landing-ui/button";

const videoUrl =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260319_015952_e1deeb12-8fb7-4071-a42a-60779fc64ab6.mp4";

export function MenorahHomeHero() {
  const heroRef = useRef<HTMLElement>(null);
  const scrollProgress = useScrollProgress(heroRef);
  const reducedMotion = usePrefersReducedMotion();

  return (
    <section
      ref={heroRef}
      data-menorah-home-ready
      className="landing-home-scroll-stage relative text-foreground"
    >
      <div data-landing-scroll-viewport="hero" className="landing-scroll-viewport landing-home-scroll-viewport sticky top-0 relative flex flex-col overflow-hidden">
        <video
          className="landing-hero-background-video absolute inset-0 z-0 h-full w-full object-cover"
          src={videoUrl}
          muted
          autoPlay
          loop
          playsInline
          aria-hidden="true"
        />
        <div data-landing-hero-video-wash className="landing-hero-video-wash absolute inset-0 z-[1]" aria-hidden="true" />
        <HeroSection scrollProgress={scrollProgress} reducedMotion={reducedMotion} />
        <AnimatedProductMockupSection scrollProgress={scrollProgress} />
      </div>
    </section>
  );
}

function HeroSection({ scrollProgress, reducedMotion }: { scrollProgress: number; reducedMotion: boolean }) {
  const copyExitProgress = reducedMotion ? 0 : Math.min(Math.max((scrollProgress - 0.08) / 0.18, 0), 1);
  const copyStyle: CSSProperties = {
    opacity: 1 - copyExitProgress,
    transform: `translate3d(0, ${copyExitProgress * -30}px, 0) scale(${1 - copyExitProgress * 0.025})`,
    pointerEvents: copyExitProgress > 0.85 ? "none" : undefined,
    willChange: reducedMotion ? undefined : "transform, opacity"
  };

  return (
    <main
      data-landing-hero-copy
      className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-[var(--landing-page-x)] pb-[clamp(4rem,9vh,8rem)] pt-[clamp(5rem,11vh,8.5rem)]"
      style={copyStyle}
    >
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
