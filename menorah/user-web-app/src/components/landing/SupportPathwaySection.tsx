"use client";

import type { CSSProperties, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  HeartPulse,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

const featureSlides = [
  {
    title: "Private Chat",
    kicker: "01 Confidential support",
    body: "Start with a quiet one-to-one space when you need to talk without pressure.",
    points: ["Guided chat prompts", "Private conversation flow", "Support at your pace"],
    icon: MessageCircle,
    accent: "bg-menorah-green text-white",
    surface: "linear-gradient(135deg, #f1f8ec 0%, #ffffff 100%)"
  },
  {
    title: "Consultant Match",
    kicker: "02 Book the right help",
    body: "Compare support profiles, find a matching specialty, and reserve a free time.",
    points: ["Specialty based matching", "Language and timing filters", "Simple free booking"],
    icon: CalendarCheck,
    accent: "bg-menorah-olive text-white",
    surface: "linear-gradient(135deg, #fbf8ed 0%, #ffffff 100%)"
  },
  {
    title: "Self-Help Tools",
    kicker: "03 Practice between sessions",
    body: "Use short exercises and check-ins to keep progress moving after the first step.",
    points: ["Breathing exercises", "Reflection checklists", "Mood progress cues"],
    icon: HeartPulse,
    accent: "bg-emerald-700 text-white",
    surface: "linear-gradient(135deg, #effaf3 0%, #ffffff 100%)"
  },
  {
    title: "Privacy Controls",
    kicker: "04 Stay in control",
    body: "Keep the experience private with clear controls for identity, history, and access.",
    points: ["Anonymous mode", "Locked support history", "User controlled privacy"],
    icon: ShieldCheck,
    accent: "bg-slate-800 text-white",
    surface: "linear-gradient(135deg, #eef2f3 0%, #fff8e5 100%)"
  }
] as const;

export function SupportPathwaySection() {
  const sectionRef = useRef<HTMLElement>(null);
  const scrollProgress = useScrollProgress(sectionRef);
  const reducedMotion = usePrefersReducedMotion();
  const compactViewport = useMediaQuery("(max-width: 767px)");
  const progress = reducedMotion ? 0.36 : scrollProgress;
  const unfoldProgress = reducedMotion ? 1 : easeOutCubic(progressBetween(progress, 0.02, 0.18));
  const showcaseProgress = progressBetween(progress, 0.18, 0.82);
  const journeyProgress = reducedMotion ? 0 : showcaseProgress * (featureSlides.length - 1);
  const activeIndex = Math.min(featureSlides.length - 1, Math.max(0, Math.round(journeyProgress)));
  const exitProgress = reducedMotion ? 0 : easeInOutCubic(progressBetween(progress, 0.82, 0.98));
  const phoneRevealProgress = reducedMotion ? 1 : easeOutCubic(progressBetween(progress, 0.08, 0.24));
  const stageStyle: CSSProperties = {
    opacity: 1 - exitProgress,
    transform: `translate3d(0, ${lerp(0, -42, exitProgress)}px, 0) scale(${lerp(1, 0.96, exitProgress)})`,
    willChange: reducedMotion ? undefined : "transform, opacity"
  };

  return (
    <section
      ref={sectionRef}
      id="support-pathway"
      aria-labelledby="support-pathway-title"
      className="relative min-h-[460vh] bg-menorah-page text-foreground"
    >
      <h2 id="support-pathway-title" className="sr-only">
        Menorah app feature scroll showcase
      </h2>
      <div className="sticky top-0 flex h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
        <div className="feature-transition-glow pointer-events-none absolute inset-x-[-14%] top-0 z-[1] h-40 opacity-60" />
        <div
          className="relative z-10 mx-auto grid h-full w-full max-w-7xl grid-rows-[minmax(0,0.58fr)_minmax(0,0.42fr)] items-center gap-3 md:grid-rows-[minmax(0,0.56fr)_minmax(0,0.44fr)] lg:grid-cols-[0.9fr_1fr] lg:grid-rows-none lg:gap-14"
          style={stageStyle}
        >
          <div className="relative flex h-full min-h-0 items-center justify-center lg:justify-start">
            <CrushedPaper progress={unfoldProgress} reducedMotion={reducedMotion} />
            <PhoneMockup
              activeIndex={activeIndex}
              journeyProgress={journeyProgress}
              revealProgress={phoneRevealProgress}
              exitProgress={exitProgress}
              compactViewport={compactViewport}
              reducedMotion={reducedMotion}
            />
          </div>

          <div className="relative h-full min-h-0">
            <FeatureCopyStack
              activeIndex={activeIndex}
              journeyProgress={journeyProgress}
              exitProgress={exitProgress}
              reducedMotion={reducedMotion}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function CrushedPaper({
  progress,
  reducedMotion
}: {
  progress: number;
  reducedMotion: boolean;
}) {
  const crush = 1 - progress;
  const sheetStyle: CSSProperties = {
    opacity: 0.24 + progress * 0.68,
    clipPath: `polygon(${lerp(43, 0, progress)}% ${lerp(42, 2, progress)}%, ${lerp(
      60,
      100,
      progress
    )}% ${lerp(36, 0, progress)}%, ${lerp(66, 96, progress)}% ${lerp(64, 96, progress)}%, ${lerp(
      35,
      4,
      progress
    )}% ${lerp(69, 100, progress)}%)`,
    filter: `blur(${lerp(1.6, 0, progress)}px)`,
    transform: `translate3d(${lerp(-18, 0, progress)}px, ${lerp(42, 0, progress)}px, 0) rotate(${lerp(
      -22,
      -3,
      progress
    )}deg) scale(${lerp(0.38, 1.06, progress)})`,
    willChange: reducedMotion ? undefined : "clip-path, transform, opacity, filter"
  };
  const foldStyle = (x: number, y: number, rotate: number, scale: number): CSSProperties => ({
    opacity: 0.18 + progress * 0.72,
    transform: `translate3d(${x * crush}px, ${y * crush}px, 0) rotate(${rotate * crush}deg) scale(${lerp(
      0.62,
      scale,
      progress
    )})`,
    willChange: reducedMotion ? undefined : "transform, opacity"
  });

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 aspect-[0.82] w-[min(72vw,420px)] -translate-x-1/2 -translate-y-1/2 lg:w-[min(34vw,470px)]">
      <div className="support-paper-sheet support-paper-fiber absolute inset-0 rounded-lg" style={sheetStyle}>
        <span className="support-paper-fold support-paper-fold-one" style={foldStyle(-54, 22, -18, 1)} />
        <span className="support-paper-fold support-paper-fold-two" style={foldStyle(46, -30, 24, 1.04)} />
        <span className="support-paper-fold support-paper-fold-three" style={foldStyle(-34, -44, 16, 0.98)} />
        <span className="support-paper-fold support-paper-fold-four" style={foldStyle(38, 36, -22, 1.02)} />
      </div>
    </div>
  );
}

function PhoneMockup({
  activeIndex,
  journeyProgress,
  revealProgress,
  exitProgress,
  compactViewport,
  reducedMotion
}: {
  activeIndex: number;
  journeyProgress: number;
  revealProgress: number;
  exitProgress: number;
  compactViewport: boolean;
  reducedMotion: boolean;
}) {
  const phoneStyle: CSSProperties = {
    opacity: revealProgress * (1 - exitProgress),
    transform: `translate3d(0, ${lerp(compactViewport ? 46 : 72, compactViewport ? -4 : -10, revealProgress)}px, 0) rotate(${lerp(
      8,
      -2,
      revealProgress
    )}deg) scale(${lerp(compactViewport ? 0.72 : 0.78, 1, revealProgress)})`,
    willChange: reducedMotion ? undefined : "transform, opacity"
  };

  return (
    <div
      className="relative z-10 mx-auto aspect-[9/18.7] w-[min(48vw,230px)] max-w-[250px] sm:w-[min(42vw,275px)] lg:mx-0 lg:w-[min(26vw,320px)] lg:max-w-[320px]"
      style={phoneStyle}
      aria-label={`Menorah app example: ${featureSlides[activeIndex].title}`}
    >
      <div className="absolute inset-0 rounded-[2rem] bg-slate-950 p-2 shadow-[0_34px_90px_rgba(35,45,36,0.34)] ring-1 ring-white/45 sm:rounded-[2.4rem] sm:p-2.5">
        <div className="relative h-full overflow-hidden rounded-[1.55rem] bg-white sm:rounded-[1.9rem]">
          <div className="absolute left-1/2 top-2 z-30 h-6 w-24 -translate-x-1/2 rounded-full bg-slate-950 sm:h-7 sm:w-28" />
          <div className="absolute inset-x-0 top-0 z-20 flex h-12 items-end justify-between bg-white/85 px-5 pb-2 text-[10px] font-semibold text-slate-950 backdrop-blur-sm">
            <span>4:28</span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-5 rounded-full bg-slate-950/80" />
              <span className="h-2.5 w-4 rounded-[3px] border border-slate-950/60" />
            </span>
          </div>
          <div className="absolute inset-0 pt-12">
            {featureSlides.map((feature, index) => {
              const delta = reducedMotion ? index : index - journeyProgress;
              const distance = Math.abs(delta);
              const focus = 1 - smoothstep(0.04, 0.76, distance);
              const screenStyle: CSSProperties = {
                opacity: focus,
                transform: `translate3d(${lerp(28, 0, focus) * Math.sign(delta || 1)}px, ${lerp(
                  12,
                  0,
                  focus
                )}px, 0) scale(${lerp(0.96, 1, focus)})`,
                zIndex: 10 + Math.round(focus * 10),
                willChange: reducedMotion ? undefined : "transform, opacity"
              };

              return (
                <div key={feature.title} className="absolute inset-0" style={screenStyle} aria-hidden={index !== activeIndex}>
                  <PhoneScreen index={index} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PhoneScreen({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="flex h-full flex-col bg-[#f4f8ef] px-4 pb-5 pt-5">
        <ScreenHeader label="Private chat" icon={MessageCircle} />
        <div className="mt-5 flex-1 space-y-4">
          <div className="ml-auto max-w-[82%] rounded-[18px] rounded-tr-md bg-menorah-green px-4 py-3 text-xs font-medium leading-5 text-white">
            I need someone to talk to today.
          </div>
          <div className="max-w-[86%] rounded-[18px] rounded-tl-md bg-white px-4 py-3 text-xs font-medium leading-5 text-foreground shadow-sm">
            You are in a private space. We can start with one small step.
          </div>
          <div className="max-w-[76%] rounded-[18px] rounded-tl-md bg-white px-4 py-3 text-xs font-medium leading-5 text-foreground shadow-sm">
            Want to try a two-minute grounding prompt?
          </div>
        </div>
        <div className="flex h-11 items-center gap-2 rounded-full bg-white px-3 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-menorah-green" />
          <span className="h-2 flex-1 rounded-full bg-slate-200" />
          <MessageCircle className="h-4 w-4 text-menorah-green" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="flex h-full flex-col bg-[#fbf8ed] px-4 pb-5 pt-5">
        <ScreenHeader label="Consultant match" icon={CalendarCheck} />
        <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-menorah-green text-sm font-semibold text-white">
              RK
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Ramu</p>
              <p className="text-[10px] font-medium text-foreground/50">Consultant Psychologist</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] font-semibold text-menorah-green">
            <span className="rounded-md bg-menorah-green/8 px-2 py-2">Anxiety</span>
            <span className="rounded-md bg-menorah-green/8 px-2 py-2">English</span>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {["Today 7:30 PM", "Tomorrow 9:00 AM", "Friday 10:00 AM"].map((slot, itemIndex) => (
            <div
              key={slot}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-3 text-xs font-semibold shadow-sm",
                itemIndex === 0 ? "bg-menorah-green text-white" : "bg-white text-foreground"
              )}
            >
              <span>{slot}</span>
              <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="flex h-full flex-col bg-[#effaf3] px-4 pb-5 pt-5">
        <ScreenHeader label="Self-help tools" icon={HeartPulse} />
        <div className="mt-5 flex justify-center">
          <div className="flex h-36 w-36 items-center justify-center rounded-full border-[12px] border-menorah-green/12 bg-white shadow-sm">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-menorah-green text-center text-xs font-semibold leading-4 text-white">
              Breathe
              <br />
              2 min
            </div>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {[
            ["Mood check", 72],
            ["Grounding", 48],
            ["Journal prompt", 64]
          ].map(([label, width]) => (
            <div key={label} className="rounded-lg bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                <span>{label}</span>
                <CheckCircle2 className="h-4 w-4 text-menorah-green" aria-hidden="true" />
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-menorah-green/10">
                <div className="h-full rounded-full bg-menorah-green" style={{ width: `${width}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#eef2f3] px-4 pb-5 pt-5">
      <ScreenHeader label="Privacy controls" icon={ShieldCheck} />
      <div className="mt-6 flex justify-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-900 text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
          <LockKeyhole className="h-10 w-10" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {["Anonymous mode", "Lock support history", "Hide profile details"].map((label, itemIndex) => (
          <div key={label} className="flex items-center justify-between rounded-lg bg-white px-3 py-3 shadow-sm">
            <span className="text-xs font-semibold text-foreground">{label}</span>
            <span
              className={cn(
                "relative h-6 w-11 rounded-full transition",
                itemIndex === 1 ? "bg-slate-300" : "bg-menorah-green"
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm",
                  itemIndex === 1 ? "left-1" : "right-1"
                )}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenHeader({ label, icon: Icon }: { label: string; icon: typeof MessageCircle }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45">Menorah</p>
        <h3 className="mt-1 text-base font-semibold leading-tight text-foreground">{label}</h3>
      </div>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-menorah-green shadow-sm">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
    </div>
  );
}

function FeatureCopyStack({
  activeIndex,
  journeyProgress,
  exitProgress,
  reducedMotion
}: {
  activeIndex: number;
  journeyProgress: number;
  exitProgress: number;
  reducedMotion: boolean;
}) {
  return (
    <div className="relative flex h-full min-h-0 items-start justify-center pt-1 md:items-center md:pt-0 lg:justify-start">
      <div className="relative h-full w-full max-w-xl lg:h-[560px]">
        <div className="absolute left-0 top-0 hidden lg:block">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-menorah-green">In the app</p>
          <h2 className="mt-4 max-w-[600px] font-display text-5xl leading-tight">
            Watch the phone change as support unfolds.
          </h2>
        </div>

        <div className="absolute inset-x-0 top-0 lg:top-52">
          {featureSlides.map((feature, index) => {
            const delta = reducedMotion ? index : index - journeyProgress;
            const distance = Math.abs(delta);
            const focus = 1 - smoothstep(0.06, 0.82, distance);
            const Icon = feature.icon;
            const copyStyle: CSSProperties = {
              opacity: focus * (1 - exitProgress),
              transform: `translate3d(0, ${lerp(44, 0, focus) * Math.sign(delta || 1)}px, 0) scale(${lerp(
                0.97,
                1,
                focus
              )})`,
              zIndex: 10 + index,
              pointerEvents: activeIndex === index ? "auto" : "none",
              willChange: reducedMotion ? undefined : "transform, opacity"
            };

            return (
              <article
                key={feature.title}
                className="absolute inset-x-0 rounded-lg border border-foreground/8 bg-white/92 p-5 shadow-[0_18px_55px_rgba(35,45,36,0.1)] backdrop-blur-sm md:p-6"
                style={{ ...copyStyle, backgroundImage: feature.surface }}
                aria-hidden={activeIndex !== index}
              >
                <div className="flex items-start gap-4">
                  <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-lg", feature.accent)}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-menorah-olive">
                      {feature.kicker}
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold leading-tight text-foreground md:text-3xl">
                      {feature.title}
                    </h3>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-foreground/72 md:text-base md:leading-7">{feature.body}</p>
                <ul className="mt-4 grid gap-2 text-sm font-medium text-foreground/72">
                  {feature.points.map((point) => (
                    <li key={point} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-menorah-green" aria-hidden="true" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-2 lg:bottom-0 lg:justify-start">
          {featureSlides.map((feature, index) => (
            <span
              key={feature.title}
              className={cn(
                "h-2.5 rounded-full transition-all duration-300",
                activeIndex === index ? "w-8 bg-menorah-green" : "w-2.5 bg-menorah-green/22"
              )}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      <div className="absolute right-0 top-0 hidden items-center gap-2 rounded-lg border border-menorah-green/10 bg-white/70 px-3 py-2 text-xs font-semibold text-menorah-green shadow-sm lg:flex">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Scroll controlled
      </div>
    </div>
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

function progressBetween(progress: number, start: number, end: number) {
  return clamp((progress - start) / (end - start), 0, 1);
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function smoothstep(edgeStart: number, edgeEnd: number, value: number) {
  const progress = clamp((value - edgeStart) / (edgeEnd - edgeStart), 0, 1);

  return progress * progress * (3 - 2 * progress);
}

function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

function easeInOutCubic(progress: number) {
  return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
