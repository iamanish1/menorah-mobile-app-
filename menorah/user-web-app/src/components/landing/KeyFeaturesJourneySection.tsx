"use client";

import type { CSSProperties, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { BookOpen, CheckCircle2, HeartPulse, LockKeyhole, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInView, useMediaQuery, usePrefersReducedMotion, useScrollProgress } from "@/components/landing/useLandingMotion";

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
  const reducedMotion = usePrefersReducedMotion();
  const compactViewport = useMediaQuery(
    "(max-width: 767px), (max-width: 1023px) and (max-height: 640px)"
  );
  // This component swaps its root section when the compact query changes.
  // Rebind the section observer so later intrinsic layout changes are measured.
  const scrollProgress = useScrollProgress(sectionRef, compactViewport);
  const featureVideoVisible = useNearViewport(sectionRef, compactViewport);
  const journeyProgress = Math.min(scrollProgress / 0.86, 1) * (features.length - 1);
  const stackExitProgress = reducedMotion ? 0 : smoothstep(0.9, 0.98, scrollProgress);
  const stackStyle: CSSProperties = {
    opacity: 1 - stackExitProgress,
    transform: `translate3d(0, ${lerp(0, -140, stackExitProgress)}px, 0) scale(${lerp(1, 0.97, stackExitProgress)})`,
    pointerEvents: stackExitProgress > 0.96 ? "none" : undefined,
    willChange: reducedMotion ? undefined : "transform, opacity"
  };
  const activeIndex = Math.min(features.length - 1, Math.max(0, Math.round(journeyProgress)));

  useFadingVideoLoop(videoRef, compactViewport, featureVideoVisible);

  if (compactViewport) {
    return (
      <section ref={sectionRef} className="relative overflow-hidden bg-background px-[var(--landing-page-x)] pb-[var(--landing-section-y-tight)] pt-[clamp(4.75rem,13vw,6.5rem)] text-foreground">
        <FeatureBackgroundVideo videoRef={videoRef} shouldLoad={featureVideoVisible} />
        <div className="relative z-10">
          <Header />
        </div>
        <div className="relative z-10 mx-auto mt-[var(--landing-stack-gap)] flex max-w-xl flex-col gap-[clamp(0.85rem,3vw,1.25rem)]">
          {features.map((feature, index) => (
            <MobileFeatureCard key={feature.title} feature={feature} index={index} reducedMotion={reducedMotion} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} data-feature-journey className="relative min-h-[420vh] bg-background text-foreground">
      <div className="landing-feature-sticky sticky top-0 flex h-screen overflow-hidden px-[var(--landing-page-x)] pb-[clamp(1rem,2.2vw,2rem)] pt-[clamp(4.75rem,8vh,6.75rem)]">
        <FeatureBackgroundVideo videoRef={videoRef} shouldLoad={featureVideoVisible} />
        <div className="relative z-10 mx-auto flex w-[var(--landing-container)] flex-col items-center">
          <Header />

          <div
            className="landing-feature-stack relative mt-[clamp(1.5rem,2.4vw,2.5rem)] h-[clamp(34rem,47vw,45rem)] w-full max-w-[clamp(58rem,64vw,72rem)]"
            style={stackStyle}
          >
            {features.map((feature, index) => {
              const delta = index - journeyProgress;
              const isActive = index === activeIndex;
              const distance = Math.abs(delta);
              const focus = reducedMotion ? Number(isActive) : 1 - smoothstep(0.08, 1.08, distance);
              const handoff = smoothstep(-0.35, 0.35, delta);
              const previousY = delta * 42;
              const incomingY = delta * 540;
              const y = lerp(previousY, incomingY, handoff);
              const previousScale = 1 - Math.min(distance, 1.4) * 0.025;
              const incomingScale = 1 - Math.min(Math.max(delta, 0), 2.4) * 0.035;
              const scale = lerp(previousScale, incomingScale, handoff);
              const pastOpacity = smoothstep(-1.3, -1.02, delta);
              const futureOpacity = 1 - smoothstep(1.88, 2.22, delta);
              const cardStyle: CSSProperties = reducedMotion
                ? {
                    opacity: Number(isActive),
                    transform: "translate3d(-50%, 0, 0)",
                    zIndex: 80 + index
                  }
                : {
                    opacity: Math.min(pastOpacity, futureOpacity),
                    transform: `translate3d(-50%, ${y}px, 0) scale(${scale})`,
                    zIndex: 80 + index,
                    willChange: "transform, opacity"
                  };

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

function FeatureBackgroundVideo({
  videoRef,
  shouldLoad
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  shouldLoad: boolean;
}) {
  return (
    <>
      <video
        ref={videoRef}
        className="absolute inset-x-0 bottom-0 top-[300px] z-0 w-full object-cover"
        src={shouldLoad ? featureBackgroundVideoUrl : undefined}
        muted
        autoPlay={shouldLoad}
        playsInline
        preload={shouldLoad ? "auto" : "none"}
        aria-hidden="true"
        style={{ opacity: 0 }}
      />
    </>
  );
}

function Header() {
  return (
    <div className="landing-feature-header mx-auto max-w-[min(56rem,92vw)] text-center">
      <p className="font-body text-[length:var(--landing-kicker)] font-semibold uppercase tracking-[0.18em] text-menorah-olive">
        Menorah features
      </p>
      <h2 className="landing-feature-heading mt-[clamp(0.45rem,0.8vw,0.75rem)] font-display text-[length:var(--landing-h2)] leading-tight text-foreground">
        Key features across your mental wellness journey.
      </h2>
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
        "landing-feature-card absolute left-1/2 top-0 grid h-[var(--landing-feature-card-height)] w-full grid-cols-[1fr_0.92fr] overflow-hidden rounded-[var(--landing-radius-xl)] border p-[var(--landing-card-pad-lg)] shadow-[0_24px_70px_rgba(35,45,36,0.12)] transition-colors duration-300",
        isActive ? "border-menorah-green/35" : "border-menorah-green/10"
      )}
      style={{ ...style, background: feature.surface }}
    >
      <div className="relative z-10 flex max-w-[360px] flex-col justify-center">
        <div className="flex items-center gap-[clamp(0.65rem,1vw,0.95rem)]">
          <div className={cn("flex h-[var(--landing-icon-sm)] w-[var(--landing-icon-sm)] items-center justify-center rounded-[var(--landing-radius-sm)] shadow-sm", feature.accent)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="text-[length:var(--landing-kicker)] font-semibold uppercase tracking-[0.18em] text-menorah-olive">0{index + 1}</span>
        </div>
        <h3 className="landing-feature-card-title mt-[clamp(1.25rem,2vw,2rem)] text-[length:var(--landing-h3)] font-semibold leading-tight text-foreground">{feature.title}</h3>
        <ul className="landing-feature-card-list mt-[clamp(1rem,1.8vw,1.6rem)] space-y-[clamp(0.75rem,1.1vw,1.1rem)] text-[length:var(--landing-body-sm)] leading-[1.6] text-foreground/75">
          {feature.points.map((point) => (
            <li key={point} className="flex gap-3">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-menorah-green" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        {feature.title === "Privacy & Security" ? (
          <div className="landing-feature-privacy-badge mt-[clamp(1rem,1.6vw,1.5rem)] flex w-fit items-center gap-2 rounded-[var(--landing-radius-sm)] border border-menorah-green/10 bg-white/70 px-3 py-2 text-[length:var(--landing-kicker)] font-semibold text-menorah-green">
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
      <div className="landing-feature-visual-panel relative h-[var(--landing-feature-visual-h)] w-[var(--landing-feature-visual-w)] rounded-[var(--landing-radius-lg)] bg-white/70 p-[var(--landing-card-pad)] shadow-[0_18px_55px_rgba(35,45,36,0.12)]">
        <div className="absolute left-[clamp(-1.75rem,-2vw,-0.75rem)] top-[14%] rounded-[var(--landing-radius-sm)] border border-menorah-green/10 bg-white px-[clamp(0.75rem,1vw,1rem)] py-[clamp(0.55rem,0.8vw,0.8rem)] text-[length:var(--landing-body-sm)] font-semibold text-menorah-green shadow-dashboard">
          Private chat
        </div>
        <div className="ml-auto min-h-[clamp(3.25rem,4vw,4.2rem)] w-[68%] rounded-[var(--landing-radius-md)] bg-menorah-green px-[clamp(0.75rem,1vw,1rem)] py-[clamp(0.6rem,0.8vw,0.8rem)] text-[length:var(--landing-body-sm)] font-medium text-white">
          I need someone to talk to.
        </div>
        <div className="mt-[clamp(0.85rem,1.4vw,1.25rem)] min-h-[clamp(3.25rem,4vw,4.2rem)] w-[72%] rounded-[var(--landing-radius-md)] bg-menorah-cream px-[clamp(0.75rem,1vw,1rem)] py-[clamp(0.6rem,0.8vw,0.8rem)] text-[length:var(--landing-body-sm)] font-medium text-foreground/80">
          You are in a confidential space.
        </div>
        <div className="absolute bottom-[8%] right-[8%] flex h-[var(--landing-icon-md)] w-[var(--landing-icon-md)] items-center justify-center rounded-full bg-menorah-green text-white">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="landing-feature-visual-panel relative h-[var(--landing-feature-visual-h)] w-[var(--landing-feature-visual-w)] rounded-[var(--landing-radius-lg)] bg-white/70 p-[var(--landing-card-pad)] shadow-[0_18px_55px_rgba(35,45,36,0.12)]">
        {["15-18", "19-24", "25-35"].map((label, itemIndex) => (
          <div
            key={label}
            className="absolute flex h-[clamp(4.9rem,7vw,6.5rem)] w-[clamp(4.9rem,7vw,6.5rem)] items-center justify-center rounded-full border border-menorah-green/15 bg-menorah-cream text-[length:var(--landing-body-sm)] font-semibold text-menorah-green shadow-sm"
            style={{
              left: `${11 + itemIndex * 23}%`,
              top: `${17 + Math.abs(itemIndex - 1) * 19}%`
            }}
          >
            {label}
          </div>
        ))}
        <div className="absolute bottom-[13%] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-[clamp(0.85rem,1vw,1.1rem)] py-[clamp(0.45rem,0.7vw,0.65rem)] text-[length:var(--landing-body-sm)] font-semibold text-menorah-olive shadow-dashboard">
          <Users className="h-4 w-4" aria-hidden="true" />
          Man2Man
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="landing-feature-visual-panel relative h-[var(--landing-feature-visual-h)] w-[var(--landing-feature-visual-w)] rounded-[var(--landing-radius-lg)] bg-white/70 p-[var(--landing-card-pad)] shadow-[0_18px_55px_rgba(35,45,36,0.12)]">
        {["Breathe", "Ground", "Reflect"].map((label, itemIndex) => (
          <div key={label} className="mb-[clamp(0.75rem,1vw,1rem)] rounded-[var(--landing-radius-sm)] border border-menorah-green/10 bg-white px-[clamp(0.75rem,1vw,1rem)] py-[clamp(0.6rem,0.8vw,0.8rem)] shadow-sm">
            <div className="flex items-center justify-between text-[length:var(--landing-body-sm)] font-semibold text-foreground">
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
      <div className="landing-feature-visual-panel relative h-[var(--landing-feature-visual-h)] w-[var(--landing-feature-visual-w)] rounded-[var(--landing-radius-lg)] bg-white/70 p-[var(--landing-card-pad)] shadow-[0_18px_55px_rgba(35,45,36,0.12)]">
        <div className="h-[42%] rounded-[var(--landing-radius-md)] bg-slate-900 p-[clamp(0.75rem,1vw,1rem)] text-white">
          <div className="flex h-full items-center justify-center rounded-xl border border-white/15">
            <BookOpen className="h-8 w-8" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-[clamp(0.75rem,1vw,1rem)] grid grid-cols-2 gap-[clamp(0.6rem,0.8vw,0.8rem)]">
          <div className="rounded-[var(--landing-radius-sm)] bg-menorah-cream p-[clamp(0.6rem,0.8vw,0.8rem)] text-[length:var(--landing-body-sm)] font-semibold text-menorah-green">Articles</div>
          <div className="rounded-[var(--landing-radius-sm)] bg-menorah-cream p-[clamp(0.6rem,0.8vw,0.8rem)] text-[length:var(--landing-body-sm)] font-semibold text-menorah-green">Videos</div>
          <div className="col-span-2 rounded-[var(--landing-radius-sm)] bg-white p-[clamp(0.6rem,0.8vw,0.8rem)] text-[length:var(--landing-body-sm)] font-semibold text-menorah-olive shadow-sm">
            Men&apos;s mental health resources
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-feature-visual-panel landing-feature-privacy-visual relative h-[var(--landing-feature-visual-h)] w-[var(--landing-feature-visual-w)] rounded-[var(--landing-radius-lg)] bg-white/70 p-[var(--landing-card-pad)] shadow-[0_18px_55px_rgba(35,45,36,0.12)]">
      <div className="landing-feature-privacy-orb mx-auto flex h-[clamp(5.5rem,8vw,7.4rem)] w-[clamp(5.5rem,8vw,7.4rem)] items-center justify-center rounded-full bg-menorah-green text-white shadow-dashboard">
        <ShieldCheck className="landing-feature-privacy-icon h-12 w-12" aria-hidden="true" />
      </div>
      <div className="landing-feature-privacy-options mt-[clamp(1rem,1.8vw,1.55rem)] space-y-[clamp(0.6rem,0.9vw,0.8rem)]">
        {["Anonymous mode", "Encrypted data", "Privacy controls"].map((label) => (
          <div key={label} className="landing-feature-privacy-option flex items-center justify-between rounded-[var(--landing-radius-sm)] bg-white px-[clamp(0.75rem,1vw,1rem)] py-[clamp(0.6rem,0.8vw,0.8rem)] text-[length:var(--landing-body-sm)] font-semibold text-foreground shadow-sm">
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
  const isVisible = useInView(cardRef, 0.18);
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
      className={cn(
        "rounded-[var(--landing-radius-md)] border border-menorah-green/10 p-[var(--landing-card-pad)] shadow-dashboard backdrop-blur-[2px]",
        !reducedMotion && "transition duration-500 ease-out"
      )}
      style={cardStyle}
    >
      <div className="flex items-start gap-4">
        <div className={cn("flex h-[var(--landing-icon-sm)] w-[var(--landing-icon-sm)] shrink-0 items-center justify-center rounded-[var(--landing-radius-sm)]", feature.accent)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-[length:var(--landing-kicker)] font-semibold uppercase tracking-[0.18em] text-menorah-olive">0{index + 1}</p>
          <h3 className="mt-1 text-[length:var(--landing-card-title)] font-semibold leading-tight text-foreground">{feature.title}</h3>
        </div>
      </div>
      <ul className="mt-[clamp(1rem,3vw,1.35rem)] space-y-[clamp(0.6rem,2vw,0.9rem)] text-[length:var(--landing-body-sm)] leading-[1.6] text-foreground/75">
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

function useNearViewport(ref: RefObject<HTMLElement | null>, resetKey: boolean) {
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    if (isNear) {
      return;
    }

    const element = ref.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      setIsNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100% 0px", threshold: 0 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [isNear, ref, resetKey]);

  return isNear;
}

function useFadingVideoLoop(
  videoRef: RefObject<HTMLVideoElement | null>,
  resetKey: boolean,
  shouldPlay: boolean
) {
  useEffect(() => {
    const video = videoRef.current;

    if (!video || !shouldPlay) {
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
        void video.play().catch(() => {});
      }, 100);
    };

    const startVideo = () => {
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      void video.play().catch(() => {});

      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(monitorVideo);
      }
    };

    const resumeVisibleVideo = () => {
      if (!document.hidden) {
        startVideo();
      }
    };

    video.addEventListener("ended", restartVideo);
    video.addEventListener("canplay", startVideo);
    window.addEventListener("pageshow", resumeVisibleVideo);
    document.addEventListener("visibilitychange", resumeVisibleVideo);
    startVideo();

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      if (restartTimer) {
        window.clearTimeout(restartTimer);
      }

      video.removeEventListener("ended", restartVideo);
      video.removeEventListener("canplay", startVideo);
      window.removeEventListener("pageshow", resumeVisibleVideo);
      document.removeEventListener("visibilitychange", resumeVisibleVideo);
    };
  }, [resetKey, shouldPlay, videoRef]);
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
