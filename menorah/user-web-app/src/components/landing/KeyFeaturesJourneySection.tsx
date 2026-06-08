"use client";

import type { CSSProperties, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { BookOpen, CheckCircle2, HeartPulse, LockKeyhole, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const featureBackgroundVideoUrl =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4";

const features = [
  {
    title: "Confidential Chat Support",
    icon: MessageCircle,
    points: [
      "One-to-one conversations with trained peer supporters.",
      "Access to counsellors for guidance and support.",
      "Judgment-free and confidential environment."
    ],
    accent: "bg-menorah-green text-white",
    mobileSurface: "linear-gradient(135deg, hsl(var(--menorah-green) / 0.08) 0%, rgb(236 253 245 / 0.98) 100%)",
    surface: "linear-gradient(135deg, #f4f8ef 0%, #ecfdf5 100%)"
  },
  {
    title: "Man2Man Community",
    icon: Users,
    points: [
      "Peer-to-peer support network.",
      "Age-based communities:",
      "15-18",
      "19-24",
      "25-35",
      "Connect with men facing similar challenges and life situations."
    ],
    accent: "bg-menorah-olive text-white",
    mobileSurface: "linear-gradient(135deg, hsl(var(--menorah-olive) / 0.1) 0%, hsl(var(--menorah-cream) / 0.98) 100%)",
    surface: "linear-gradient(135deg, #f7f4e8 0%, #fbfaf5 100%)"
  },
  {
    title: "Self-Help Tools",
    icon: HeartPulse,
    points: [
      "Mental wellness exercises.",
      "Coping strategies.",
      "Stress and anxiety management resources.",
      "Evidence-based self-improvement techniques."
    ],
    accent: "bg-emerald-700 text-white",
    mobileSurface: "linear-gradient(135deg, rgb(4 120 87 / 0.08) 0%, rgb(255 255 255 / 0.98) 100%)",
    surface: "linear-gradient(135deg, #eff7f0 0%, #ffffff 100%)"
  },
  {
    title: "Expert Resources & Media",
    icon: BookOpen,
    points: [
      "Articles and educational content.",
      "Mental health videos.",
      "Newsletters and informational resources.",
      "Content specifically tailored to men's mental health."
    ],
    accent: "bg-slate-800 text-white",
    mobileSurface: "linear-gradient(135deg, rgb(30 41 59 / 0.08) 0%, hsl(var(--menorah-page) / 0.98) 100%)",
    surface: "linear-gradient(135deg, #eef1f4 0%, #fcf5e4 100%)"
  },
  {
    title: "Privacy & Security",
    icon: ShieldCheck,
    points: [
      "Confidential conversations.",
      "Anonymous interactions.",
      "Encrypted data transmission.",
      "User-controlled privacy."
    ],
    accent: "bg-menorah-green text-white",
    mobileSurface: "linear-gradient(135deg, hsl(var(--menorah-green) / 0.08) 0%, hsl(var(--menorah-cream) / 0.98) 100%)",
    surface: "linear-gradient(135deg, #eef7ef 0%, #fbf3dc 100%)"
  }
] as const;

export function KeyFeaturesJourneySection() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollProgress = useScrollProgress(sectionRef);
  const reducedMotion = usePrefersReducedMotion();
  const compactViewport = useMediaQuery("(max-width: 767px)");
  const journeyProgress = reducedMotion ? 0 : scrollProgress * (features.length - 1);
  const activeIndex = reducedMotion ? 0 : Math.min(features.length - 1, Math.max(0, Math.round(journeyProgress)));

  useFadingVideoLoop(videoRef, compactViewport);

  if (compactViewport) {
    return (
      <section className="relative overflow-hidden bg-background px-4 py-16 text-foreground sm:px-6">
        <FeatureTransitionGlow />
        <FeatureBackgroundVideo videoRef={videoRef} />
        <div className="relative z-10">
          <Header />
        </div>
        <div className="relative z-10 mx-auto mt-10 flex max-w-xl flex-col gap-4">
          {features.map((feature, index) => (
            <MobileFeatureCard key={feature.title} feature={feature} index={index} reducedMotion={reducedMotion} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} className="relative min-h-[340vh] bg-background text-foreground">
      <FeatureTransitionGlow />
      <div className="sticky top-0 flex h-screen overflow-hidden px-6 py-9 lg:px-10">
        <FeatureBackgroundVideo videoRef={videoRef} />
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center">
          <Header />

          <div className="relative mt-8 h-[630px] w-full max-w-[920px]">
            {features.map((feature, index) => {
              const delta = reducedMotion ? index : index - journeyProgress;
              const distance = Math.abs(delta);
              const focus = 1 - smoothstep(0.08, 1.08, distance);
              const handoff = smoothstep(-0.35, 0.35, delta);
              const previousY = delta * 42;
              const incomingY = delta * 540;
              const y = lerp(previousY, incomingY, handoff);
              const previousScale = 1 - Math.min(distance, 1.4) * 0.025;
              const incomingScale = 1 - Math.min(Math.max(delta, 0), 2.4) * 0.035;
              const scale = lerp(previousScale, incomingScale, handoff);
              const pastOpacity = smoothstep(-1.3, -1.02, delta);
              const futureOpacity = 1 - smoothstep(1.88, 2.22, delta);
              const cardStyle: CSSProperties = {
                opacity: Math.min(pastOpacity, futureOpacity),
                transform: `translate3d(-50%, ${y}px, 0) scale(${scale})`,
                zIndex: 80 + index,
                willChange: reducedMotion ? undefined : "transform, opacity"
              };
              const isActive = index === activeIndex;

              return (
                <StackedFeatureCard
                  key={feature.title}
                  feature={feature}
                  index={index}
                  isActive={isActive}
                  focus={focus}
                  style={cardStyle}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureTransitionGlow() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-48 -translate-y-20 overflow-hidden sm:h-56 sm:-translate-y-24"
      aria-hidden="true"
    >
      <div className="feature-transition-glow absolute inset-x-[-12%] top-10 h-28 sm:h-36" />
    </div>
  );
}

function FeatureBackgroundVideo({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }) {
  return (
    <>
      <video
        ref={videoRef}
        className="absolute inset-x-0 bottom-0 top-[300px] z-0 w-full object-cover"
        src={featureBackgroundVideoUrl}
        muted
        autoPlay
        playsInline
        preload="auto"
        aria-hidden="true"
        style={{ opacity: 0 }}
      />
    </>
  );
}

function Header() {
  return (
    <div className="mx-auto max-w-4xl text-center">
      <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-menorah-olive">
        Menorah features
      </p>
      <h2 className="mt-2 font-display text-4xl leading-tight text-foreground md:text-[2.75rem]">
        Key features across your mental wellness journey.
      </h2>
      <p className="mx-auto mt-3 max-w-3xl text-base leading-7 text-foreground/70">
        From private support to self-help tools, Menorah gives men a safe space to understand themselves, connect with
        others, and take the next step with clarity.
      </p>
    </div>
  );
}

function StackedFeatureCard({
  feature,
  index,
  isActive,
  focus,
  style
}: {
  feature: (typeof features)[number];
  index: number;
  isActive: boolean;
  focus: number;
  style: CSSProperties;
}) {
  const Icon = feature.icon;
  const visualStyle: CSSProperties = {
    opacity: 0.62 + focus * 0.38,
    transform: `translate3d(0, ${lerp(16, 0, focus)}px, 0) scale(${lerp(0.94, 1, focus)})`
  };

  return (
    <article
      className={cn(
        "absolute left-1/2 top-0 grid h-[455px] w-full grid-cols-[1fr_0.92fr] overflow-hidden rounded-[30px] border p-10 shadow-[0_24px_70px_rgba(35,45,36,0.12)] transition-colors duration-300",
        isActive ? "border-menorah-green/35" : "border-menorah-green/10"
      )}
      style={{ ...style, background: feature.surface }}
    >
      <div className="relative z-10 flex max-w-[360px] flex-col justify-center">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg shadow-sm", feature.accent)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-menorah-olive">0{index + 1}</span>
        </div>
        <h3 className="mt-7 text-3xl font-semibold leading-tight text-foreground">{feature.title}</h3>
        <ul className="mt-6 space-y-4 text-[15px] leading-6 text-foreground/75">
          {feature.points.map((point) => (
            <li key={point} className="flex gap-3">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-menorah-green" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        {feature.title === "Privacy & Security" ? (
          <div className="mt-6 flex w-fit items-center gap-2 rounded-md border border-menorah-green/10 bg-white/70 px-3 py-2 text-xs font-semibold text-menorah-green">
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            User-controlled privacy
          </div>
        ) : null}
      </div>

      <div className="relative flex items-center justify-center" style={visualStyle}>
        <FeatureVisual index={index} />
      </div>
    </article>
  );
}

function FeatureVisual({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="relative h-[250px] w-[310px] rounded-[26px] bg-white/70 p-5 shadow-[0_18px_55px_rgba(35,45,36,0.12)]">
        <div className="absolute -left-7 top-8 rounded-lg border border-menorah-green/10 bg-white px-4 py-3 text-sm font-semibold text-menorah-green shadow-dashboard">
          Private chat
        </div>
        <div className="ml-auto h-16 w-52 rounded-2xl bg-menorah-green px-4 py-3 text-sm font-medium text-white">
          I need someone to talk to.
        </div>
        <div className="mt-5 h-16 w-56 rounded-2xl bg-menorah-cream px-4 py-3 text-sm font-medium text-foreground/80">
          You are in a confidential space.
        </div>
        <div className="absolute bottom-5 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-menorah-green text-white">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="relative h-[250px] w-[310px] rounded-[26px] bg-white/70 p-6 shadow-[0_18px_55px_rgba(35,45,36,0.12)]">
        {["15-18", "19-24", "25-35"].map((label, itemIndex) => (
          <div
            key={label}
            className="absolute flex h-24 w-24 items-center justify-center rounded-full border border-menorah-green/15 bg-menorah-cream text-sm font-semibold text-menorah-green shadow-sm"
            style={{
              left: `${34 + itemIndex * 72}px`,
              top: `${42 + Math.abs(itemIndex - 1) * 48}px`
            }}
          >
            {label}
          </div>
        ))}
        <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-menorah-olive shadow-dashboard">
          <Users className="h-4 w-4" aria-hidden="true" />
          Man2Man
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="relative h-[250px] w-[310px] rounded-[26px] bg-white/70 p-6 shadow-[0_18px_55px_rgba(35,45,36,0.12)]">
        {["Breathe", "Ground", "Reflect"].map((label, itemIndex) => (
          <div key={label} className="mb-4 rounded-lg border border-menorah-green/10 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between text-sm font-semibold text-foreground">
              <span>{label}</span>
              <HeartPulse className="h-4 w-4 text-menorah-green" aria-hidden="true" />
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-menorah-green/10">
              <div className="h-full rounded-full bg-menorah-green" style={{ width: `${58 + itemIndex * 14}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (index === 3) {
    return (
      <div className="relative h-[250px] w-[310px] rounded-[26px] bg-white/70 p-6 shadow-[0_18px_55px_rgba(35,45,36,0.12)]">
        <div className="h-28 rounded-2xl bg-slate-900 p-4 text-white">
          <div className="flex h-full items-center justify-center rounded-xl border border-white/15">
            <BookOpen className="h-8 w-8" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-menorah-cream p-3 text-sm font-semibold text-menorah-green">Articles</div>
          <div className="rounded-lg bg-menorah-cream p-3 text-sm font-semibold text-menorah-green">Videos</div>
          <div className="col-span-2 rounded-lg bg-white p-3 text-sm font-semibold text-menorah-olive shadow-sm">
            Men&apos;s mental health resources
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[250px] w-[310px] rounded-[26px] bg-white/70 p-6 shadow-[0_18px_55px_rgba(35,45,36,0.12)]">
      <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-menorah-green text-white shadow-dashboard">
        <ShieldCheck className="h-12 w-12" aria-hidden="true" />
      </div>
      <div className="mt-6 space-y-3">
        {["Anonymous mode", "Encrypted data", "Privacy controls"].map((label) => (
          <div key={label} className="flex items-center justify-between rounded-lg bg-white px-4 py-3 text-sm font-semibold text-foreground shadow-sm">
            {label}
            <LockKeyhole className="h-4 w-4 text-menorah-green" aria-hidden="true" />
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileFeatureCard({
  feature,
  index,
  reducedMotion
}: {
  feature: (typeof features)[number];
  index: number;
  reducedMotion: boolean;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const isVisible = useInView(cardRef);
  const Icon = feature.icon;
  const cardStyle: CSSProperties = {
    opacity: reducedMotion || isVisible ? 1 : 0,
    transform: `translate3d(0, ${reducedMotion || isVisible ? 0 : 24}px, 0) scale(${
      reducedMotion || isVisible ? 1 : 0.98
    })`,
    backgroundColor: "rgb(255 255 255 / 0.94)",
    backgroundImage: feature.mobileSurface
  };

  return (
    <article
      ref={cardRef}
      className="rounded-lg border border-menorah-green/10 p-5 shadow-dashboard backdrop-blur-[2px] transition duration-500 ease-out"
      style={cardStyle}
    >
      <div className="flex items-start gap-4">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", feature.accent)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-menorah-olive">0{index + 1}</p>
          <h3 className="mt-1 text-xl font-semibold leading-tight text-foreground">{feature.title}</h3>
        </div>
      </div>
      <ul className="mt-5 space-y-3 text-sm leading-6 text-foreground/75">
        {feature.points.map((point) => (
          <li key={point} className="flex gap-2.5">
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-menorah-green" aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function useScrollProgress(ref: RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);
  const targetProgressRef = useRef(0);
  const displayedProgressRef = useRef(0);

  useEffect(() => {
    let measureFrame = 0;
    let animationFrame = 0;

    const animateProgress = () => {
      animationFrame = 0;
      const currentProgress = displayedProgressRef.current;
      const targetProgress = targetProgressRef.current;
      const remainingDistance = targetProgress - currentProgress;
      const nextProgress =
        Math.abs(remainingDistance) < 0.0005 ? targetProgress : currentProgress + remainingDistance * 0.14;

      displayedProgressRef.current = nextProgress;
      setProgress((current) => (Math.abs(current - nextProgress) > 0.0001 ? nextProgress : current));

      if (Math.abs(targetProgress - nextProgress) > 0.0005) {
        animationFrame = window.requestAnimationFrame(animateProgress);
      }
    };

    const queueAnimation = () => {
      if (animationFrame) {
        return;
      }

      animationFrame = window.requestAnimationFrame(animateProgress);
    };

    const measure = () => {
      measureFrame = 0;
      const element = ref.current;

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const travel = Math.max(rect.height - window.innerHeight, 1);
      const nextProgress = clamp(-rect.top / travel, 0, 1);

      if (Math.abs(targetProgressRef.current - nextProgress) > 0.0001) {
        targetProgressRef.current = nextProgress;
        queueAnimation();
      }
    };

    const queueMeasure = () => {
      if (measureFrame) {
        return;
      }

      measureFrame = window.requestAnimationFrame(measure);
    };

    const resizeObserver = new ResizeObserver(queueMeasure);

    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    measure();
    window.addEventListener("scroll", queueMeasure, { passive: true });
    window.addEventListener("resize", queueMeasure);

    return () => {
      if (measureFrame) {
        window.cancelAnimationFrame(measureFrame);
      }

      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      resizeObserver.disconnect();
      window.removeEventListener("scroll", queueMeasure);
      window.removeEventListener("resize", queueMeasure);
    };
  }, [ref]);

  return progress;
}

function useFadingVideoLoop(videoRef: RefObject<HTMLVideoElement | null>, resetKey: boolean) {
  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    let animationFrame = 0;
    let restartTimer = 0;
    const fadeDuration = 0.5;

    const setOpacity = (opacity: number) => {
      video.style.opacity = String(clamp(opacity, 0, 1));
    };

    const monitorVideo = () => {
      const { currentTime, duration } = video;

      if (Number.isFinite(duration) && duration > 0) {
        if (currentTime < fadeDuration) {
          setOpacity(currentTime / fadeDuration);
        } else if (duration - currentTime < fadeDuration) {
          setOpacity((duration - currentTime) / fadeDuration);
        } else {
          setOpacity(1);
        }
      }

      animationFrame = window.requestAnimationFrame(monitorVideo);
    };

    const restartVideo = () => {
      setOpacity(0);
      restartTimer = window.setTimeout(() => {
        video.currentTime = 0;
        void video.play();
      }, 100);
    };

    const startVideo = () => {
      setOpacity(0);
      void video.play();
      animationFrame = window.requestAnimationFrame(monitorVideo);
    };

    video.addEventListener("ended", restartVideo);
    startVideo();

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      if (restartTimer) {
        window.clearTimeout(restartTimer);
      }

      video.removeEventListener("ended", restartVideo);
    };
  }, [resetKey, videoRef]);
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);

    updatePreference();
    media.addEventListener("change", updatePreference);

    return () => media.removeEventListener("change", updatePreference);
  }, []);

  return reducedMotion;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const updateMatch = () => setMatches(media.matches);

    updateMatch();
    media.addEventListener("change", updateMatch);

    return () => media.removeEventListener("change", updateMatch);
  }, [query]);

  return matches;
}

function useInView(ref: RefObject<HTMLElement | null>) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.18 }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return isVisible;
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function smoothstep(edgeStart: number, edgeEnd: number, value: number) {
  const progress = clamp((value - edgeStart) / (edgeEnd - edgeStart), 0, 1);

  return progress * progress * (3 - 2 * progress);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
