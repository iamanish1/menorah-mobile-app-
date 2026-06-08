"use client";

import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { Button } from "@/components/landing-ui/button";
import { MenorahNavbar } from "@/components/site/MenorahNavbar";

const videoUrl =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260319_015952_e1deeb12-8fb7-4071-a42a-60779fc64ab6.mp4";

export function MenorahHomeHero() {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <video
        className="absolute inset-0 z-0 h-full w-full object-cover"
        src={videoUrl}
        muted
        autoPlay
        loop
        playsInline
        aria-hidden="true"
      />
      <MenorahNavbar />
      <HeroSection />
    </div>
  );
}

function HeroSection() {
  return (
    <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-hidden px-4">
      <section className="relative z-10 flex w-full flex-col items-center pt-5 sm:pt-8 lg:pt-10">
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

        <div className="mt-5 w-full max-w-6xl">
          <ProductPreview />
        </div>
      </section>
    </main>
  );
}

function ProductPreview() {
  return (
    <div
      className="hero-product-mockup pointer-events-none relative mx-auto w-[min(86vw,640px)] select-none sm:w-[min(80vw,680px)] lg:w-[min(62vw,720px)]"
      aria-hidden="true"
    >
      <div className="hero-laptop-mockup relative z-10 mx-auto aspect-[425/283] w-full overflow-hidden">
        <Image
          src="/menorah-hero-laptop-transparent.png"
          alt=""
          width={1024}
          height={1280}
          priority
          unoptimized
          sizes="(min-width: 1024px) 720px, 86vw"
          className="absolute left-1/2 z-10 block h-auto w-full max-w-none -translate-x-1/2 opacity-100 drop-shadow-[0_28px_70px_rgba(0,0,0,0.18)]"
          style={{ top: "-44%" }}
        />
      </div>
      <Image
        src="/menorah-product-phone.png"
        alt=""
        width={447}
        height={559}
        priority
        unoptimized
        sizes="(min-width: 1024px) 170px, 26vw"
        className="hero-phone-mockup absolute right-[3%] top-[-2%] z-20 block h-auto w-[27%] min-w-[96px] max-w-[170px] opacity-100 drop-shadow-[0_22px_55px_rgba(0,0,0,0.18)] sm:right-[5%] sm:top-[-4%] sm:w-[25%] md:right-[7%] md:top-[-6%] md:w-[23%] lg:right-[8%]"
      />
    </div>
  );
}
