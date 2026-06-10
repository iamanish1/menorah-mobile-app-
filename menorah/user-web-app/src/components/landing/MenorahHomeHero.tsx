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
    <section ref={heroRef} data-menorah-home-ready className="relative min-h-[460vh] bg-background text-foreground">
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden">
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
    <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 pb-16 sm:pb-20 lg:pb-24">
      <section className="relative z-10 flex w-full flex-col items-center">
        <h1 className="max-w-5xl text-center font-display text-5xl leading-[0.95] tracking-tight text-foreground md:text-6xl lg:text-[5rem]">
          We are Menorah, the worlds first free mental health app for men!
        </h1>

        <p className="mt-4 max-w-[650px] text-center font-body text-base leading-relaxed text-muted-foreground md:text-lg">
          A free mental health platform built for men in India to understand stress, burnout, anxiety, relationships,
          and help-seeking with private support and practical resources.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button asChild className="rounded-full px-6 py-5 font-body text-sm font-medium">
            <Link href="/register">Book a demo</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="rounded-full border border-primary/25 bg-background/70 px-6 py-5 font-body text-sm font-medium backdrop-blur"
          >
            <Link href="/articles">Read articles</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
