"use client";

import type { CSSProperties, RefObject } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  HeartPulse,
  LockKeyhole,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserRound,
  Users,
  Video
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, Badge, Button } from "@/components/ui";
import { useMediaQuery, usePrefersReducedMotion, useScrollProgress } from "@/components/landing/useLandingMotion";

const webNavItems = [
  { id: "discover", label: "Discover", icon: Search },
  { id: "articles", label: "Articles", icon: BookOpen },
  { id: "bookings", label: "Bookings", icon: CalendarDays },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "profile", label: "Profile", icon: UserRound }
] as const;

type WebMockFeature = (typeof webNavItems)[number]["id"];

const counsellors = [
  {
    name: "Dr. Rayan Khalid",
    role: "Stress & anxiety",
    rating: "4.9",
    next: "Today 7:30 PM",
    language: "English",
    initials: "RK"
  },
  {
    name: "Ayaan Mehta",
    role: "Career pressure",
    rating: "4.8",
    next: "Tomorrow 9:00 AM",
    language: "Hindi",
    initials: "AM"
  },
  {
    name: "Omar Siddiqui",
    role: "Sleep & routines",
    rating: "4.9",
    next: "Fri 5:00 PM",
    language: "Arabic",
    initials: "OS"
  }
] as const;

const articles = [
  {
    title: "How to reset after a difficult week",
    category: "Stress",
    time: "5 min read",
    excerpt: "A practical way to pause, name the pressure, and choose one next step."
  },
  {
    title: "What burnout looks like in high-performing men",
    category: "Work",
    time: "7 min read",
    excerpt: "Spot the signs before they turn into isolation or shutdown."
  },
  {
    title: "Building a better sleep boundary",
    category: "Sleep",
    time: "4 min read",
    excerpt: "Small evening changes that make rest easier to protect."
  }
] as const;

const bookings = [
  { title: "Awaiting Assignment", meta: "Instant session", status: "Upcoming", time: "Online - Video" },
  { title: "Session with Rayan", meta: "Stress management", status: "Completed", time: "45 min" }
] as const;

const chatRooms = [
  { name: "Dr. Rayan Khalid", preview: "Let us start with the pressure at work.", time: "1:32 AM", unread: 2 },
  { name: "Ayaan Mehta", preview: "Your next session is confirmed.", time: "Yesterday", unread: 0 },
  { name: "Support team", preview: "We are here if you need help.", time: "Mon", unread: 0 }
] as const;

const waveformBars = [14, 24, 32, 18, 28, 38, 22, 34, 26, 42, 30, 20, 36, 44, 24, 34];

const demoFilterControls = [
  {
    label: "Specialization",
    initialValue: "Stress",
    options: ["All specializations", "Stress", "Sleep", "Relationships", "Work pressure"]
  },
  {
    label: "Language",
    initialValue: "English",
    options: ["Any language", "English", "Hindi", "Arabic", "Malayalam"]
  },
  {
    label: "Minimum Rating",
    initialValue: "4.5 stars & above",
    options: ["5 stars & above", "4.5 stars & above", "4 stars & above", "Any rating"]
  }
] as const;

export function AnimatedProductMockupSection({ scrollRootRef }: { scrollRootRef: RefObject<HTMLElement | null> }) {
  const scrollProgress = useScrollProgress(scrollRootRef, 0.1);
  const reducedMotion = usePrefersReducedMotion();
  const compactViewport = useMediaQuery("(max-width: 767px)");
  const tabletViewport = useMediaQuery("(max-width: 1023px)");
  const mockUnfoldEnd = 0.42;
  const mockUntiltEnd = 0.54;
  const featureCycleStart = mockUntiltEnd;
  const featureCycleEnd = 0.9;

  const dashboardProgress = reducedMotion ? 1 : easeOutCubic(progressBetween(scrollProgress, 0.02, 0.24));
  const dashboardLiftProgress = reducedMotion ? 1 : easeOutCubic(progressBetween(scrollProgress, 0.08, mockUnfoldEnd));
  const dashboardUntiltProgress = reducedMotion ? 1 : easeInOutCubic(progressBetween(scrollProgress, 0.1, mockUntiltEnd));
  const backPanelProgress = reducedMotion ? 1 : easeOutCubic(progressBetween(scrollProgress, 0.02, 0.16));
  const frameProgress = reducedMotion ? 1 : easeOutCubic(progressBetween(scrollProgress, 0.07, 0.24));
  const contentProgress = reducedMotion ? 1 : easeOutCubic(progressBetween(scrollProgress, 0.16, mockUnfoldEnd));
  const badgeProgress = reducedMotion ? 1 : easeOutBack(progressBetween(scrollProgress, 0.22, mockUnfoldEnd));
  const featureProgress = reducedMotion ? 0 : progressBetween(scrollProgress, featureCycleStart, featureCycleEnd);
  const autoJourneyProgress = reducedMotion ? 0 : featureProgress * (webNavItems.length - 1);
  const autoFeatureIndex = Math.min(webNavItems.length - 1, Math.max(0, Math.round(autoJourneyProgress)));

  const dashboardStartY = compactViewport ? 248 : tabletViewport ? 292 : 328;
  const dashboardEndY = compactViewport ? 10 : tabletViewport ? 20 : 34;
  const dashboardStartScale = compactViewport ? 0.88 : tabletViewport ? 0.84 : 0.78;
  const dashboardEndScale = compactViewport ? 0.96 : tabletViewport ? 0.94 : 0.88;
  const dashboardStartRotateX = compactViewport ? 34 : tabletViewport ? 48 : 56;
  const dashboardRotateX = reducedMotion ? 0 : lerp(dashboardStartRotateX, 0, dashboardUntiltProgress);
  const dashboardDepth = reducedMotion ? 0 : lerp(-92, 0, dashboardLiftProgress);
  const clipTop = reducedMotion ? 0 : lerp(35, 0, dashboardProgress);
  const clipSide = reducedMotion ? 0 : lerp(8, 0, dashboardProgress);
  const blur = reducedMotion ? 0 : lerp(3, 0, dashboardProgress);

  const dashboardStyle: CSSProperties = {
    opacity: reducedMotion ? 1 : progressBetween(scrollProgress, 0.05, 0.28),
    clipPath: `inset(${clipTop}% ${clipSide}% 0% ${clipSide}% round 24px)`,
    filter: `blur(${blur}px)`,
    transform: `translateX(-50%) translateY(-50%) translate3d(0, ${lerp(
      dashboardStartY,
      dashboardEndY,
      dashboardLiftProgress
    )}px, 0) perspective(1800px) translateZ(${dashboardDepth}px) scale(${lerp(
      dashboardStartScale,
      dashboardEndScale,
      dashboardProgress
    )}) rotateX(${-dashboardRotateX}deg) rotateY(0deg) rotateZ(0deg)`,
    transformOrigin: "center center",
    perspectiveOrigin: "50% 50%",
    transformStyle: "preserve-3d",
    backfaceVisibility: "hidden",
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
    transformOrigin: "center center",
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
      8,
      badgeProgress
    )}deg) scale(${lerp(0.72, 1, badgeProgress)})`,
    willChange: reducedMotion ? undefined : "transform, opacity"
  };

  return (
    <div
      data-product-dashboard
      data-menorah-landing-theme="source"
      className="absolute left-1/2 top-1/2 z-20 w-[var(--landing-dashboard-width)] [--mockup-y-inset:clamp(1rem,5svh,5rem)]"
      style={dashboardStyle}
    >
      <DashboardMockup
        backPanelStyle={backPanelStyle}
        frameStyle={frameStyle}
        contentStyle={contentStyle}
        badgeStyle={badgeStyle}
        reducedMotion={reducedMotion}
        autoFeature={webNavItems[autoFeatureIndex].id}
      />
    </div>
  );
}

function DashboardMockup({
  backPanelStyle,
  frameStyle,
  contentStyle,
  badgeStyle,
  reducedMotion,
  autoFeature
}: {
  backPanelStyle: CSSProperties;
  frameStyle: CSSProperties;
  contentStyle: CSSProperties;
  badgeStyle: CSSProperties;
  reducedMotion: boolean;
  autoFeature: WebMockFeature;
}) {
  const [manualFeature, setManualFeature] = useState<WebMockFeature | null>(null);
  const [bookingTab, setBookingTab] = useState<"upcoming" | "completed">("upcoming");
  const [chatMode, setChatMode] = useState<"all" | "unread">("all");
  const activeFeature = manualFeature ?? autoFeature;

  const selectedNav = webNavItems.find((item) => item.id === activeFeature) ?? webNavItems[0];
  const ActiveIcon = selectedNav.icon;

  return (
    <div className="relative mx-auto aspect-[16/11] w-full max-h-[calc(100svh-var(--mockup-y-inset)-var(--mockup-y-inset))] select-none overflow-visible [perspective:1400px] sm:aspect-[16/10] lg:aspect-[16/9]">
      <div
        className="absolute left-[clamp(1.25rem,4vw,2.5rem)] right-[clamp(1.25rem,4vw,2.5rem)] top-[-18px] h-full rounded-lg border border-primary-100 bg-white/55 shadow-[0_18px_80px_rgba(45,122,92,0.12)] backdrop-blur-xl"
        style={backPanelStyle}
      />
      <div
        className="absolute left-[clamp(3rem,7vw,5rem)] right-[clamp(3rem,7vw,5rem)] top-[-34px] hidden h-full rounded-lg border border-primary-100 bg-white/35 blur-[1px] sm:block"
        style={backPanelStyle}
      />

      <div
        className="relative z-10 flex h-full flex-col overflow-hidden rounded-[var(--landing-radius-md)] border border-primary-100 bg-white text-gray-950 shadow-[0_34px_120px_rgba(45,122,92,0.18),0_0_0_1px_rgba(45,122,92,0.08)]"
        style={frameStyle}
      >
        <div className="flex h-[clamp(3rem,3.6vw,4rem)] items-center justify-between border-b border-primary-100 bg-primary-50/95 px-[clamp(0.75rem,1.3vw,1.5rem)]">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-primary-500" />
          </div>
          <div className="hidden h-8 w-[40%] items-center rounded-full border border-primary-100 bg-white px-3 text-xs font-semibold text-primary-700 sm:flex">
            app.menorah.health/{activeFeature}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-primary-100 bg-white px-3 py-1 text-xs font-black text-primary-700 sm:inline-flex">
              Interactive demo
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-primary-700 ring-1 ring-primary-100">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[clamp(3.25rem,12vw,4.4rem)_minmax(0,1fr)] sm:grid-cols-[clamp(10.5rem,18vw,14.5rem)_minmax(0,1fr)]" style={contentStyle}>
          <aside className="border-r border-primary-100 bg-white/95 px-[clamp(0.5rem,0.8vw,1rem)] py-[clamp(0.75rem,1.1vw,1.25rem)] text-gray-950 shadow-[0_22px_60px_-34px_rgba(17,24,39,0.55)]">
            <div className="mx-auto flex h-[clamp(2.25rem,2.8vw,3.1rem)] w-[clamp(2.25rem,2.8vw,3.1rem)] items-center justify-center rounded-2xl bg-primary-600 text-white sm:mx-0">
              <HeartPulse className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-3 hidden text-lg font-black text-gray-950 sm:block">Menorah</p>
            <p className="hidden text-[11px] font-semibold text-gray-500 sm:block">Mind Over Matter</p>

            <nav className="mt-5 space-y-0.5" aria-label="Demo web app features">
              {webNavItems.map((item) => (
                <WebNavButton
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={activeFeature === item.id}
                  onClick={() => setManualFeature(item.id)}
                />
              ))}
            </nav>
          </aside>

          <main className="min-w-0 overflow-hidden bg-[var(--app-bg)] p-[clamp(0.65rem,1.8vw,1.45rem)]">
            <div className="flex min-h-0 h-full flex-col">
              <div className="mb-[clamp(0.6rem,1vw,1rem)] flex flex-col gap-[clamp(0.6rem,1vw,1rem)] rounded-[var(--landing-radius-lg)] border border-primary-100 bg-primary-50 px-[clamp(0.85rem,1.6vw,1.5rem)] py-[clamp(0.85rem,1.3vw,1.25rem)] shadow-[0_14px_32px_-26px_rgba(45,122,92,0.5)] sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-primary-700">
                    <ActiveIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {selectedNav.label}
                  </p>
                  <h3 className="app-page-heading mt-1 truncate">
                    {getFeatureHeading(activeFeature)}
                  </h3>
                  <p className="app-page-subtitle mt-0.5 hidden sm:block">{getFeatureSubtitle(activeFeature)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="input-field flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full py-0 pl-4 pr-4 text-left text-xs font-semibold text-gray-500 sm:w-64 sm:flex-none">
                    <Search className="h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
                    <span className="truncate">{getFeatureSearch(activeFeature)}</span>
                  </button>
                  <button
                    className="app-pill flex h-11 w-11 shrink-0 items-center justify-center px-0"
                    aria-label="Open demo filters"
                  >
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div
                key={activeFeature}
                className={cn(
                  "min-h-0 flex-1 overflow-hidden",
                  !reducedMotion && "animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out will-change-[transform,opacity]"
                )}
              >
                <WebFeaturePanel
                  feature={activeFeature}
                  bookingTab={bookingTab}
                  setBookingTab={setBookingTab}
                  chatMode={chatMode}
                  setChatMode={setChatMode}
                />
              </div>
            </div>
          </main>
        </div>
      </div>

      <div
        className="absolute bottom-[clamp(0.45rem,2vw,0.75rem)] right-[clamp(0.25rem,1vw,0.75rem)] z-20 w-[clamp(8.5rem,18vw,11rem)] rounded-lg border border-primary-200 bg-primary-600 p-[clamp(0.75rem,1.5vw,1rem)] text-white shadow-[0_22px_60px_rgba(45,122,92,0.28)] sm:-right-5"
        style={badgeStyle}
      >
        <span className="absolute -left-8 top-7 h-10 w-10 rounded-tl-full border-l border-t border-dashed border-primary-200/60" />
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/18">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-black leading-none">5 flows</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-primary-50/80">Scroll or tap</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WebNavButton({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-10 w-full items-center justify-center gap-3 rounded-2xl px-2 text-sm font-bold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 sm:justify-start sm:px-3",
        active
          ? "bg-primary-600 text-white shadow-[0_10px_28px_-18px_rgba(45,122,92,0.8)]"
          : "text-gray-500 hover:bg-primary-50 hover:text-gray-900"
      )}
      aria-pressed={active}
      aria-label={`Show ${label} demo`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="hidden truncate sm:inline">{label}</span>
    </button>
  );
}

function WebFeaturePanel({
  feature,
  bookingTab,
  setBookingTab,
  chatMode,
  setChatMode
}: {
  feature: WebMockFeature;
  bookingTab: "upcoming" | "completed";
  setBookingTab: (value: "upcoming" | "completed") => void;
  chatMode: "all" | "unread";
  setChatMode: (value: "all" | "unread") => void;
}) {
  if (feature === "articles") {
    return (
      <div className="page-container h-full max-w-none overflow-hidden !px-0 !py-0">
        <div className="grid h-full min-h-0 gap-3 md:grid-cols-[1fr_0.8fr]">
          <div className="card min-h-0 overflow-hidden p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="section-title">Articles</h4>
                <p className="app-page-subtitle mt-0.5">Practical mental health reads</p>
              </div>
              <Badge variant="primary">30 posts</Badge>
            </div>
            <div className="mt-4 space-y-3">
            {articles.map((article) => (
              <button
                type="button"
                key={article.title}
                className="card flex w-full gap-3 p-3 text-left transition-colors hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              >
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-lg font-black text-primary-700">
                  {article.category.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <Badge variant="primary">{article.category}</Badge>
                  <span className="mt-1 block line-clamp-1 text-sm font-black text-gray-950">{article.title}</span>
                  <span className="mt-1 block line-clamp-2 text-xs leading-5 text-gray-500">{article.excerpt}</span>
                </span>
                <ChevronRight className="mt-6 h-4 w-4 text-primary-600" aria-hidden="true" />
              </button>
            ))}
            </div>
          </div>
          <div className="card flex min-h-0 flex-col justify-between p-4">
            <div>
              <Badge variant="success">Featured</Badge>
              <h4 className="mt-3 text-2xl font-black text-gray-950">How to reset after a difficult week</h4>
              <p className="mt-3 text-sm leading-6 text-gray-500">
                Article previews use the same card, badge, and typography system as the app while staying demo-only.
              </p>
            </div>
            <Button size="sm" className="mt-6 w-fit">Read preview</Button>
          </div>
        </div>
      </div>
    );
  }

  if (feature === "bookings") {
    const visibleBooking = bookingTab === "upcoming" ? bookings[0] : bookings[1];

    return (
      <div className="page-container h-full max-w-none overflow-hidden !px-0 !py-0">
        <div className="grid h-full min-h-0 gap-3 md:grid-cols-[1fr_0.8fr]">
          <div className="card p-4">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(["upcoming", "completed"] as const).map((tab) => (
              <button
                type="button"
                key={tab}
                onClick={() => setBookingTab(tab)}
                className={cn(
                  "flex shrink-0 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
                  bookingTab === tab ? "bg-primary-600 text-white" : "border border-primary-100 bg-white text-gray-600 hover:border-primary-300"
                )}
                aria-pressed={bookingTab === tab}
              >
                {tab === "upcoming" ? <CalendarDays className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
            </div>

            <DemoBookingCard booking={visibleBooking} />
            <DemoBookingCard booking={bookings[bookingTab === "upcoming" ? 1 : 0]} compact />
          </div>
          <div className="card flex min-h-0 flex-col justify-between p-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
              <Plus className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-gray-500">Book a session</p>
              <h4 className="mt-2 text-2xl font-black text-gray-950">Track and manage your sessions</h4>
              <p className="mt-3 text-sm leading-6 text-gray-500">Tabs and cards mirror the real bookings screen.</p>
            </div>
            <Button size="sm" className="mt-6 w-fit">Book Session</Button>
          </div>
        </div>
      </div>
    );
  }

  if (feature === "chat") {
    const visibleRooms = chatMode === "unread" ? chatRooms.filter((room) => room.unread > 0) : chatRooms;

    return (
      <div className="page-container h-full max-w-none overflow-hidden !px-0 !py-0">
        <div className="grid h-full min-h-0 gap-3 md:grid-cols-[0.9fr_1fr]">
          <div className="card min-h-0 p-4">
            <h4 className="mb-3 text-sm font-black uppercase tracking-wide text-gray-500">Recent Conversations</h4>
          <div className="mb-3 flex gap-2">
            {(["all", "unread"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                onClick={() => setChatMode(mode)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
                  chatMode === mode ? "bg-primary-600 text-white" : "border border-primary-100 bg-white text-gray-600 hover:border-primary-300"
                )}
                aria-pressed={chatMode === mode}
              >
                {mode === "all" ? "All" : "Unread"}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {visibleRooms.map((room) => (
              <DemoChatRoomButton key={room.name} room={room} />
            ))}
          </div>
          </div>
          <div className="card flex min-h-0 flex-col p-4">
          <div className="mb-4 flex items-center gap-3 border-b border-primary-100 pb-3">
            <Avatar name="Dr. Rayan Khalid" size="md" online />
            <div>
              <p className="text-sm font-black text-gray-950">Dr. Rayan Khalid</p>
              <p className="text-xs text-primary-700">Online now</p>
            </div>
          </div>
          <div className="space-y-3 text-xs font-semibold">
            <p className="max-w-[72%] rounded-2xl bg-primary-50 p-3 text-gray-600">You are in a private space. We can start with one small step.</p>
            <p className="ml-auto max-w-[72%] rounded-2xl bg-primary-600 p-3 text-white">I need someone to talk to today.</p>
            <p className="max-w-[72%] rounded-2xl bg-primary-50 p-3 text-gray-600">Want to try a two-minute grounding prompt?</p>
          </div>
          <div className="mt-auto pt-4">
            <div className="input-field flex h-11 items-center rounded-full py-0 text-xs text-gray-400">Type a message...</div>
          </div>
          </div>
        </div>
      </div>
    );
  }

  if (feature === "profile") {
    return (
      <div className="page-container h-full max-w-none overflow-hidden !px-0 !py-0">
        <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[0.92fr_1fr]">
          <div className="flex min-h-0 flex-col justify-between overflow-hidden rounded-3xl border border-primary-500/20 p-5 text-white shadow-[0_18px_50px_-30px_rgba(45,122,92,0.8)] [background:linear-gradient(135deg,#2d7a5c_0%,#24654c_58%,#1d4f3c_100%)]">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar name="John Doe" size="xl" className="rounded-full border-2 border-white/70 shadow-[0_12px_30px_-20px_rgba(0,0,0,0.55)]" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h4 className="min-w-0 truncate text-xl font-black text-white">John Doe</h4>
                  <Badge variant="success" className="shrink-0 bg-white/[0.92] text-primary-700">Free</Badge>
                </div>
                <p className="mt-1 truncate text-sm font-medium text-white/[0.82]">john.doe@example.com</p>
                <p className="mt-0.5 text-xs text-white/[0.65]">+1 555 013 2048</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="success" className="bg-white/[0.92] text-primary-700">Email verified</Badge>
                  <Badge variant="success" className="bg-white/[0.92] text-primary-700">Phone verified</Badge>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              {[
                ["Plan", "Free"],
                ["Sessions", "Ready"],
                ["Status", "Verified"]
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-2xl bg-white/[0.14] px-3 py-2 ring-1 ring-white/[0.12]">
                  <p className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-white/[0.62]">{label}</p>
                  <p className="mt-1 truncate text-sm font-black text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-0 space-y-3 overflow-hidden">
            <ProfileMenuSection
              title="Account"
              items={[
                ["Edit Profile", UserRound],
                ["Change Password", LockKeyhole]
              ]}
            />
            <ProfileMenuSection
              title="Preferences"
              items={[
                ["Notification Preferences", Bell],
                ["Privacy Settings", ShieldCheck]
              ]}
            />
            <ProfileMenuSection title="Support" items={[["Crisis Resources & Help", HeartPulse]]} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container h-full max-w-none overflow-hidden !px-0 !py-0">
      <div className="flex h-full min-h-0 gap-4">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="card space-y-4 p-5">
            <div className="flex items-center gap-2 font-black text-gray-950">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filters
            </div>
            {demoFilterControls.map((control) => (
              <DemoFilterControl
                key={control.label}
                label={control.label}
                initialValue={control.initialValue}
                options={control.options}
              />
            ))}
            <Button fullWidth size="sm">Apply Filters</Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="mb-3 text-sm text-gray-500">Showing 3 of 24 counsellors</p>
          <div className="counsellor-profile-grid grid gap-4">
            {counsellors.slice(0, 2).map((counsellor, index) => (
              <DemoCounsellorProfileCard key={counsellor.name} counsellor={counsellor} index={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoFilterControl({
  label,
  initialValue,
  options
}: {
  label: string;
  initialValue: string;
  options: readonly string[];
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative block space-y-1.5 text-sm font-semibold text-gray-700">
      <span id={`${id}-label`}>{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        className={cn(
          "group flex h-10 w-full items-center justify-between gap-2 rounded-2xl border border-primary-100 bg-white px-3 text-left text-xs font-black text-gray-950 shadow-[0_10px_22px_-20px_rgba(17,24,39,0.46)] transition duration-200",
          "hover:-translate-y-0.5 hover:border-primary-300 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          open && "border-primary-400 bg-primary-50 shadow-[0_16px_34px_-26px_rgba(45,122,92,0.62)]"
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <span id={`${id}-value`} className="min-w-0 truncate">{value}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-primary-600 transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-labelledby={`${id}-label`}
          className="absolute left-0 right-0 z-40 mt-2 origin-top overflow-hidden rounded-2xl border border-primary-100 bg-white/[0.98] p-1.5 shadow-[0_22px_60px_-30px_rgba(17,24,39,0.65)] backdrop-blur-xl animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200"
        >
          {options.map((option, index) => {
            const selected = value === option;

            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  "group/option flex min-h-9 w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-black transition duration-200 animate-in fade-in slide-in-from-top-1",
                  "hover:-translate-y-0.5 hover:bg-primary-50 hover:shadow-[0_12px_22px_-20px_rgba(45,122,92,0.62)] focus-visible:bg-primary-50 focus-visible:outline-none",
                  selected && "bg-primary-100 text-primary-950"
                )}
                style={{ animationDelay: `${index * 24}ms`, animationFillMode: "both" }}
                onClick={() => {
                  setValue(option);
                  setOpen(false);
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition duration-200",
                      selected ? "border-primary-600 bg-primary-600 text-white" : "border-primary-100 bg-primary-50 text-primary-600"
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full bg-current transition-transform duration-200", selected ? "scale-100" : "scale-0")} />
                  </span>
                  <span className="min-w-0 truncate">{option}</span>
                </span>
                <Check className={cn("h-3.5 w-3.5 shrink-0 text-primary-700 transition duration-200", selected ? "scale-100 opacity-100" : "scale-75 opacity-0")} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DemoCounsellorProfileCard({
  counsellor,
  index
}: {
  counsellor: (typeof counsellors)[number];
  index: number;
}) {
  return (
    <article
      className="counsellor-profile-card group"
      style={{ animationDelay: `${index * 70}ms`, animationFillMode: "both" }}
    >
      <div className="counsellor-profile-card__hero directory-wave-header">
        <div className="relative z-10 max-w-[68%]">
          <h3 className="truncate text-lg font-semibold leading-tight text-white">{counsellor.name}</h3>
          <p className="mt-1 truncate text-xs font-medium text-white/85">{counsellor.role}</p>
        </div>

        <div className="counsellor-profile-card__avatar" aria-hidden="true">
          {counsellor.initials.charAt(0)}
        </div>
      </div>

      <div className="counsellor-profile-card__body">
        <div className="flex gap-2 overflow-hidden border-b border-[#e3e7e0] pb-4">
          {["Stress", counsellor.language, "Online"].map((tag) => (
            <span key={tag} className="counsellor-profile-card__tag">
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3 border-b border-[#e3e7e0] pb-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1f2933] text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
            <Video className="h-5 w-5" aria-hidden="true" />
          </span>

          <div className="counsellor-profile-card__waveform" aria-hidden="true">
            {waveformBars.map((height, barIndex) => (
              <span key={`${height}-${barIndex}`} style={{ height, animationDelay: `${barIndex * 45}ms` }} />
            ))}
          </div>

          <button type="button" className="counsellor-profile-card__outline-button">
            View Profile
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1.5">
          <div className="counsellor-profile-card__stat">
            <p className="counsellor-profile-card__stat-value">120+</p>
            <p className="counsellor-profile-card__stat-label">Therapy hrs</p>
          </div>
          <div className="counsellor-profile-card__stat">
            <p className="counsellor-profile-card__stat-value">{counsellor.language}</p>
            <p className="counsellor-profile-card__stat-label">Languages</p>
          </div>
          <div className="counsellor-profile-card__stat">
            <p className="counsellor-profile-card__stat-value">Free</p>
            <p className="counsellor-profile-card__stat-label">Per session</p>
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between gap-4 border-t border-[#e3e7e0] pt-4">
          <div className="min-w-0">
            <p className="counsellor-profile-card__availability-label">Next available in</p>
            <p className="counsellor-profile-card__availability-value">{counsellor.next}</p>
          </div>
          <button type="button" className="counsellor-profile-card__book-button">
            Book Now
          </button>
        </div>
      </div>
    </article>
  );
}

function DemoBookingCard({ booking, compact = false }: { booking: (typeof bookings)[number]; compact?: boolean }) {
  return (
    <div className={cn("card mt-4 flex gap-4 p-4 transition-shadow hover:shadow-md", compact && "opacity-70")}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50">
        <Video className="h-5 w-5 text-primary-600" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-bold text-gray-950">{booking.title}</p>
          <Badge variant={booking.status === "Completed" ? "success" : "primary"}>{booking.status}</Badge>
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {booking.meta}
        </p>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
          <span>{booking.time}</span>
          <span>Free</span>
        </div>
      </div>
    </div>
  );
}

function DemoChatRoomButton({ room }: { room: (typeof chatRooms)[number] }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-[1.4rem] p-4 text-left transition-colors hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
    >
      <Avatar name={room.name} size="md" online={room.name !== "Support team"} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={cn("truncate font-bold text-gray-950", room.unread > 0 && "font-black")}>{room.name}</span>
          <span className="shrink-0 text-xs text-gray-400">{room.time}</span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={cn("truncate text-sm", room.unread > 0 ? "font-medium text-gray-900" : "text-gray-400")}>
            {room.preview}
          </span>
          {room.unread > 0 && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-medium text-white">
              {room.unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function ProfileMenuSection({ title, items }: { title: string; items: Array<[string, LucideIcon]> }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-primary-100 bg-primary-50 px-4 py-2">
        <p className="text-xs font-black uppercase tracking-wide text-primary-700">{title}</p>
      </div>
      <div className="divide-y divide-primary-50">
        {items.map(([label, Icon]) => (
          <button
            type="button"
            key={label}
            className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary-50">
              <Icon className="h-4 w-4 text-primary-600" aria-hidden="true" />
            </span>
            <span className="flex-1 text-sm font-bold text-gray-700 group-hover:text-gray-950">{label}</span>
            <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

function DemoInsightCard({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: LucideIcon }) {
  return (
    <div className="flex min-h-0 flex-col justify-between rounded-2xl border border-primary-100 bg-white p-4">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="mt-6">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-primary-700">{title}</p>
        <h4 className="mt-2 text-2xl font-black text-gray-950">{value}</h4>
        <p className="mt-3 text-sm leading-6 text-gray-500">{detail}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-primary-50/70 p-3">
      <Icon className="h-4 w-4 text-primary-600" aria-hidden="true" />
      <p className="mt-3 text-lg font-black text-gray-950">{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-gray-500">{label}</p>
    </div>
  );
}

function getFeatureHeading(feature: WebMockFeature) {
  const headings: Record<WebMockFeature, string> = {
    discover: "Find your counsellor",
    articles: "Read practical resources",
    bookings: "Track and manage sessions",
    chat: "Private counsellor messages",
    profile: "Settings and account support"
  };

  return headings[feature];
}

function getFeatureSubtitle(feature: WebMockFeature) {
  const subtitles: Record<WebMockFeature, string> = {
    discover: "Browse certified men's mental health counsellors",
    articles: "Searchable resources for practical support",
    bookings: "Track and manage your sessions",
    chat: "Chat with a counsellor",
    profile: "Account settings and support"
  };

  return subtitles[feature];
}

function getFeatureSearch(feature: WebMockFeature) {
  const placeholders: Record<WebMockFeature, string> = {
    discover: "Search by name or specialization",
    articles: "Search articles",
    bookings: "Filter bookings",
    chat: "Search counsellor or messages",
    profile: "Find account settings"
  };

  return placeholders[feature];
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

function easeInOutCubic(progress: number) {
  return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function easeOutBack(progress: number) {
  const overshoot = 1.70158;

  return 1 + (overshoot + 1) * Math.pow(progress - 1, 3) + overshoot * Math.pow(progress - 1, 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
