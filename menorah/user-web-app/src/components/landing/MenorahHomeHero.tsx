"use client";

import { useRef } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { AnimatedProductMockupSection } from "@/components/landing/AnimatedProductMockupSection";
import { Button } from "@/components/landing-ui/button";
import { MenorahNavbar } from "@/components/site/MenorahNavbar";

const videoUrl =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260319_015952_e1deeb12-8fb7-4071-a42a-60779fc64ab6.mp4";

export function MenorahHomeHero() {
  const heroRef = useRef<HTMLElement>(null);

  return (
    <section ref={heroRef} data-menorah-home-ready className="relative min-h-[165vh] bg-background text-foreground">
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
        <MenorahNavbar className="z-30" />
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
          A free mental health platform built to help men understand their patterns, find support, and take the next
          step with clarity.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <Button asChild className="rounded-full px-6 py-5 font-body text-sm font-medium">
            <Link href="/contact-us">Book a demo</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Play product video"
            className="h-11 w-11 rounded-full border-0 bg-background shadow-play hover:bg-background/80"
          >
            <Play className="h-4 w-4 fill-foreground text-foreground" aria-hidden="true" />
          </Button>
        </div>
      </section>
    </main>
  );
}
