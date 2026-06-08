"use client";

import type { CSSProperties, RefObject } from "react";
import { useEffect, useState } from "react";
import { BarChart3, CheckCircle2, HeartPulse, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const providerRows = [
  {
    initials: "NW",
    provider: "Northwell",
    service: "Guided session",
    time: "Same day",
    intake: "App intake",
    method: "Video care",
    cost: "Free",
    accent: "bg-blue-600"
  },
  {
    initials: "AH",
    provider: "Anchor Hub",
    service: "Peer support",
    time: "2 hrs",
    intake: "Private form",
    method: "Live chat",
    cost: "Free",
    accent: "bg-indigo-600"
  },
  {
    initials: "CV",
    provider: "Care Vault",
    service: "Resource plan",
    time: "Today",
    intake: "Screening",
    method: "Self-paced",
    cost: "Free",
    accent: "bg-cyan-600"
  },
  {
    initials: "ML",
    provider: "Mindline",
    service: "Coach match",
    time: "24 hrs",
    intake: "Checklist",
    method: "Voice call",
    cost: "Free",
    accent: "bg-violet-600"
  }
] as const;

const metrics = [
  {
    label: "Active matches",
    value: "2,418",
    detail: "+18%",
    icon: Users
  },
  {
    label: "Care coverage",
    value: "94%",
    detail: "verified",
    icon: ShieldCheck
  },
  {
    label: "Response time",
    value: "1.8h",
    detail: "median",
    icon: BarChart3
  }
] as const;

export function AnimatedProductMockupSection({ scrollRootRef }: { scrollRootRef: RefObject<HTMLElement | null> }) {
  const scrollProgress = useScrollProgress(scrollRootRef);
  const reducedMotion = usePrefersReducedMotion();
  const compactViewport = useMediaQuery("(max-width: 767px)");
  const tabletViewport = useMediaQuery("(max-width: 1023px)");

  const dashboardProgress = reducedMotion ? 1 : easeOutCubic(progressBetween(scrollProgress, 0.02, 0.92));
  const backPanelProgress = reducedMotion ? 1 : easeOutCubic(progressBetween(scrollProgress, 0.02, 0.24));
  const frameProgress = reducedMotion ? 1 : easeOutCubic(progressBetween(scrollProgress, 0.07, 0.34));
  const contentProgress = reducedMotion ? 1 : easeOutCubic(progressBetween(scrollProgress, 0.24, 0.62));
  const badgeProgress = reducedMotion ? 1 : easeOutBack(progressBetween(scrollProgress, 0.42, 0.74));

  const dashboardStartY = compactViewport ? 300 : tabletViewport ? 330 : 360;
  const dashboardEndY = compactViewport ? -16 : tabletViewport ? -32 : -40;
  const dashboardStartScale = compactViewport ? 0.82 : tabletViewport ? 0.8 : 0.78;
  const dashboardEndScale = compactViewport ? 0.96 : tabletViewport ? 0.98 : 1;
  const dashboardStartRotateX = compactViewport ? 28 : tabletViewport ? 48 : 65;
  const dashboardEndRotateX = 0;
  const dashboardRotateX = reducedMotion ? 0 : lerp(dashboardStartRotateX, dashboardEndRotateX, dashboardProgress);
  const dashboardRotateZ = reducedMotion ? 0 : lerp(-1, 0, dashboardProgress);
  const clipTop = reducedMotion ? 0 : lerp(35, 0, dashboardProgress);
  const clipSide = reducedMotion ? 0 : lerp(8, 0, dashboardProgress);
  const blur = reducedMotion ? 0 : lerp(3, 0, dashboardProgress);

  const dashboardStyle: CSSProperties = {
    opacity: reducedMotion ? 1 : progressBetween(scrollProgress, 0.05, 0.28),
    clipPath: `inset(${clipTop}% ${clipSide}% 0% ${clipSide}% round 24px)`,
    filter: `blur(${blur}px)`,
    transform: `perspective(1500px) translateX(-50%) translate3d(0, ${lerp(
      dashboardStartY,
      dashboardEndY,
      dashboardProgress
    )}px, 0) translateY(-50%) scale(${lerp(
      dashboardStartScale,
      dashboardEndScale,
      dashboardProgress
    )}) rotateX(${dashboardRotateX}deg) rotateZ(${dashboardRotateZ}deg)`,
    transformOrigin: "bottom center",
    transformStyle: "preserve-3d",
    willChange: reducedMotion ? undefined : "transform, opacity, clip-path, filter"
  };

  const backPanelStyle: CSSProperties = {
    opacity: backPanelProgress,
    transform: `translate3d(0, ${lerp(22, 0, backPanelProgress)}px, -26px) scale(${lerp(
      0.96,
      1,
      backPanelProgress
    )})`,
    willChange: reducedMotion ? undefined : "transform, opacity"
  };

  const frameStyle: CSSProperties = {
    opacity: frameProgress,
    transform: `translate3d(0, ${lerp(18, 0, frameProgress)}px, 0) scaleY(${lerp(0.86, 1, frameProgress)})`,
    transformOrigin: "bottom center",
    willChange: reducedMotion ? undefined : "transform, opacity"
  };

  const contentStyle: CSSProperties = {
    opacity: contentProgress,
    transform: `translate3d(0, ${lerp(22, 0, contentProgress)}px, 18px)`,
    willChange: reducedMotion ? undefined : "transform, opacity"
  };

  const badgeStyle: CSSProperties = {
    opacity: badgeProgress,
    transform: `translate3d(0, ${lerp(18, 0, badgeProgress)}px, 34px) rotate(${lerp(
      3,
      10,
      badgeProgress
    )}deg) scale(${lerp(0.72, 1, badgeProgress)})`,
    willChange: reducedMotion ? undefined : "transform, opacity"
  };

  return (
    <div
      data-product-dashboard
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 w-[min(1360px,calc(100vw-var(--mockup-x-inset)-var(--mockup-x-inset)))] max-h-[calc(100vh-var(--mockup-y-inset)-var(--mockup-y-inset))] [--mockup-x-inset:16px] [--mockup-y-inset:24px] sm:[--mockup-x-inset:clamp(32px,8vw,190px)] sm:[--mockup-y-inset:clamp(32px,7vh,190px)]"
      style={dashboardStyle}
      aria-hidden="true"
    >
      <DashboardMockup
        backPanelStyle={backPanelStyle}
        frameStyle={frameStyle}
        contentStyle={contentStyle}
        badgeStyle={badgeStyle}
      />
    </div>
  );
}

function DashboardMockup({
  backPanelStyle,
  frameStyle,
  contentStyle,
  badgeStyle
}: {
  backPanelStyle: CSSProperties;
  frameStyle: CSSProperties;
  contentStyle: CSSProperties;
  badgeStyle: CSSProperties;
}) {
  return (
    <div
      className="pointer-events-none relative mx-auto aspect-[4/5] w-full max-h-[calc(100vh-var(--mockup-y-inset)-var(--mockup-y-inset))] select-none overflow-visible [perspective:1400px] sm:aspect-[16/9]"
      aria-hidden="true"
    >
      <div
        className="absolute left-6 right-6 top-[-18px] h-full rounded-lg border border-white/20 bg-white/10 shadow-[0_18px_80px_rgba(74,103,255,0.16)] backdrop-blur-xl sm:left-10 sm:right-10"
        style={backPanelStyle}
      />
      <div
        className="absolute left-12 right-12 top-[-34px] hidden h-full rounded-lg border border-white/10 bg-white/5 blur-[1px] sm:block"
        style={backPanelStyle}
      />

      <div
        className="relative z-10 flex h-full flex-col overflow-hidden rounded-lg border border-white/70 bg-white text-slate-950 shadow-[0_34px_120px_rgba(0,0,0,0.46),0_0_0_1px_rgba(15,23,42,0.05)]"
        style={frameStyle}
      >
        <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 sm:h-14 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
          <div className="hidden h-8 w-[38%] items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-400 sm:flex">
            platform.menorah.health/dashboard
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 sm:inline-flex">
              Live routing
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white">
              <LockKeyhole className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>

        <div
          className="grid min-h-0 flex-1 grid-cols-[48px_minmax(0,1fr)] sm:grid-cols-[68px_minmax(0,1fr)]"
          style={contentStyle}
        >
          <aside className="border-r border-slate-200 bg-slate-950 px-2 py-4 text-white sm:px-3 sm:py-5">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 sm:h-10 sm:w-10">
              <HeartPulse className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="mt-5 space-y-3">
              {[0, 1, 2, 3].map((item) => (
                <span
                  key={item}
                  className={cn(
                    "mx-auto block h-8 w-8 rounded-md border border-white/10",
                    item === 0 ? "bg-white/20" : "bg-white/5"
                  )}
                />
              ))}
            </div>
          </aside>

          <div className="flex min-w-0 flex-col bg-white p-3 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Provider routing</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950 sm:text-2xl">Care options dashboard</h3>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                98% verified
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              {metrics.map((metric, index) => {
                const Icon = metric.icon;

                return (
                  <div
                    key={metric.label}
                    className={cn(
                      "rounded-md border border-slate-200 bg-slate-50 p-3",
                      index === 2 && "hidden sm:block"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-medium text-slate-500">{metric.label}</span>
                      <Icon className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <span className="text-xl font-semibold text-slate-950">{metric.value}</span>
                      <span className="rounded bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-500 shadow-sm">
                        {metric.detail}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-slate-200">
              <div className="grid shrink-0 grid-cols-[minmax(0,1.35fr)_0.8fr_auto] gap-2 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid-cols-[minmax(0,1.35fr)_0.85fr_0.85fr_0.9fr_0.9fr_0.6fr_auto]">
                <span>Provider</span>
                <span className="hidden md:block">Service</span>
                <span>Timing</span>
                <span className="hidden md:block">Intake</span>
                <span className="hidden md:block">Method</span>
                <span className="hidden md:block">Cost</span>
                <span className="text-right">Action</span>
              </div>

              <div className="flex min-h-0 flex-1 flex-col divide-y divide-slate-100">
                {providerRows.map((row, index) => (
                  <div
                    key={row.provider}
                    className={cn(
                      "grid flex-1 grid-cols-[minmax(0,1.35fr)_0.8fr_auto] items-center gap-2 px-3 py-2.5 text-xs text-slate-600 md:grid-cols-[minmax(0,1.35fr)_0.85fr_0.85fr_0.9fr_0.9fr_0.6fr_auto] md:text-[13px]",
                      index > 1 && "hidden sm:grid"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white",
                          row.accent
                        )}
                      >
                        {row.initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">{row.provider}</p>
                        <p className="truncate text-[10px] text-slate-400 md:hidden">{row.service}</p>
                      </div>
                    </div>
                    <span className="hidden truncate md:block">{row.service}</span>
                    <span className="w-fit rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                      {row.time}
                    </span>
                    <span className="hidden truncate md:block">{row.intake}</span>
                    <span className="hidden truncate md:block">{row.method}</span>
                    <span className="hidden font-semibold tabular-nums text-slate-950 md:block">{row.cost}</span>
                    <span className="justify-self-end rounded-md bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white shadow-[0_8px_18px_rgba(37,99,235,0.22)]">
                      Select
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="absolute bottom-3 right-1 z-20 w-36 rounded-lg border border-blue-200/40 bg-blue-600 p-3 text-white shadow-[0_22px_60px_rgba(37,99,235,0.42)] sm:-right-5 sm:bottom-2 sm:w-44 sm:p-4"
        style={badgeStyle}
      >
        <span className="absolute -left-8 top-7 h-10 w-10 rounded-tl-full border-l border-t border-dashed border-blue-200/40" />
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/20">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <p className="text-lg font-semibold leading-none">+400</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-100">Providers</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function useScrollProgress(ref: RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const element = ref.current;

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const travel = Math.max(rect.height - window.innerHeight, 1);
      const nextProgress = clamp(-rect.top / travel, 0, 1);

      setProgress((current) => (Math.abs(current - nextProgress) > 0.001 ? nextProgress : current));
    };

    const queueMeasure = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(measure);
    };

    const resizeObserver = new ResizeObserver(queueMeasure);

    if (ref.current) {
      resizeObserver.observe(ref.current);
    }

    measure();
    window.addEventListener("scroll", queueMeasure, { passive: true });
    window.addEventListener("resize", queueMeasure);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
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

function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

function easeOutBack(progress: number) {
  const overshoot = 1.70158;

  return 1 + (overshoot + 1) * Math.pow(progress - 1, 3) + overshoot * Math.pow(progress - 1, 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
