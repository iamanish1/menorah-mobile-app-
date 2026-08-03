"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatedProductMockupSection } from "@/components/landing/AnimatedProductMockupSection";
import { useScrollProgress } from "@/components/landing/useLandingMotion";
import { Button } from "@/components/landing-ui/button";

const heroBackgroundVideoUrl =
  "https://res.cloudinary.com/delcdlmli/video/upload/v1785372722/menorah/landing/hero-background-v20260730.mp4";
const heroBackgroundVideoFallbackUrl =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260319_015952_e1deeb12-8fb7-4071-a42a-60779fc64ab6.mp4";
const heroBackgroundPosterUrl =
  "https://res.cloudinary.com/delcdlmli/image/upload/v1785372736/menorah/landing/hero-background-poster-v20260730.jpg";

export function MenorahHomeHero() {
  const heroRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsPlaybackControl, setNeedsPlaybackControl] = useState(false);
  const scrollProgress = useScrollProgress(heroRef);

  const startVideo = useCallback(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("muted", "");

    if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      setNeedsPlaybackControl(false);
      return;
    }

    if (video.error) {
      video.load();
    }

    void video.play().then(
      () => setNeedsPlaybackControl(false),
      () => {
        // Browsers cannot be forced past a per-site autoplay policy or Safari
        // Low Power Mode. Keep the poster visible and expose an explicit play
        // action so the visitor can recover playback with one click.
        setNeedsPlaybackControl(true);
      }
    );
  }, []);

  useEffect(() => {
    const hero = heroRef.current;
    const video = videoRef.current;

    if (!video) {
      hero?.setAttribute("data-menorah-home-ready", "true");
      return;
    }

    const resumeVisibleVideo = () => {
      if (!document.hidden) {
        startVideo();
      }
    };
    const hidePlaybackControl = () => setNeedsPlaybackControl(false);
    const showPlaybackControlForUnexpectedPause = () => {
      if (!document.hidden && !video.ended) {
        setNeedsPlaybackControl(true);
      }
    };
    const playbackCheck = window.setTimeout(() => {
      if ((video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) && !document.hidden) {
        setNeedsPlaybackControl(true);
      }
    }, 3000);

    startVideo();
    video.addEventListener("loadedmetadata", startVideo);
    video.addEventListener("canplay", startVideo);
    video.addEventListener("playing", hidePlaybackControl);
    video.addEventListener("pause", showPlaybackControlForUnexpectedPause);
    window.addEventListener("pageshow", resumeVisibleVideo);
    document.addEventListener("visibilitychange", resumeVisibleVideo);
    window.addEventListener("pointerdown", startVideo, { passive: true });
    window.addEventListener("touchstart", startVideo, { passive: true });
    window.addEventListener("keydown", startVideo);
    // The loading screen waits for this client-only marker. At this point the
    // scroll observer and media recovery handlers are attached, so a visitor
    // cannot begin scrolling an SSR-only, non-interactive mockup.
    hero?.setAttribute("data-menorah-home-ready", "true");

    return () => {
      video.removeEventListener("loadedmetadata", startVideo);
      video.removeEventListener("canplay", startVideo);
      video.removeEventListener("playing", hidePlaybackControl);
      video.removeEventListener("pause", showPlaybackControlForUnexpectedPause);
      window.removeEventListener("pageshow", resumeVisibleVideo);
      document.removeEventListener("visibilitychange", resumeVisibleVideo);
      window.removeEventListener("pointerdown", startVideo);
      window.removeEventListener("touchstart", startVideo);
      window.removeEventListener("keydown", startVideo);
      window.clearTimeout(playbackCheck);
      hero?.removeAttribute("data-menorah-home-ready");
    };
  }, [startVideo]);

  return (
    <section
      ref={heroRef}
      className="landing-home-scroll-stage relative bg-background text-foreground"
    >
      <div
        data-landing-scroll-viewport="hero"
        className="landing-hero-media-fallback landing-scroll-viewport landing-home-scroll-viewport sticky top-0 relative flex flex-col overflow-hidden"
      >
        <video
          ref={videoRef}
          className="absolute inset-0 z-0 h-full w-full object-cover"
          poster={heroBackgroundPosterUrl}
          muted
          autoPlay
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          aria-hidden="true"
        >
          <source src={heroBackgroundVideoUrl} type="video/mp4" />
          <source src={heroBackgroundVideoFallbackUrl} type="video/mp4" />
        </video>
        {needsPlaybackControl ? (
          <button
            type="button"
            data-hero-video-playback-control
            onClick={startVideo}
            className="absolute bottom-5 left-5 z-30 min-h-11 rounded-full border border-foreground/15 bg-background/90 px-4 text-sm font-medium text-foreground shadow-lg backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Play background
          </button>
        ) : null}
        <HeroSection />
        <AnimatedProductMockupSection scrollProgress={scrollProgress} />
      </div>
    </section>
  );
}

function HeroSection() {
  return (
    <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-[var(--landing-page-x)] pb-[clamp(4rem,9vh,8rem)] pt-[clamp(5rem,11vh,8.5rem)]">
      <section className="relative z-10 flex w-full max-w-[min(78rem,94vw)] flex-col items-center">
        <h1 className="text-center font-display text-[length:var(--landing-hero-title)] leading-[0.96] tracking-tight text-foreground">
          Menorah helps men find verified counsellors and practical wellbeing resources
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
