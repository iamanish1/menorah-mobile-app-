"use client";

import type { CSSProperties, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  HeartPulse,
  LockKeyhole,
  Menu,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound
} from "lucide-react";
import { cn } from "@/lib/utils";

const featureSlides = [
  {
    title: "Discover",
    kicker: "01 Support hub",
    body: "Find articles, quick routes to support, and clear next steps from the first screen.",
    points: ["Search support and articles", "Fast route to chat", "Readable resource cards"],
    icon: Search,
    accent: "bg-menorah-green text-white",
    surface: "linear-gradient(135deg, #f1f8ec 0%, #ffffff 100%)"
  },
  {
    title: "Bookings",
    kicker: "02 Session planning",
    body: "Keep upcoming sessions visible with the same quiet interface language as the rest of the app.",
    points: ["Upcoming session state", "Online video details", "Clear booking tabs"],
    icon: CalendarCheck,
    accent: "bg-menorah-olive text-white",
    surface: "linear-gradient(135deg, #fbf8ed 0%, #ffffff 100%)"
  },
  {
    title: "Private Chat",
    kicker: "03 Confidential support",
    body: "Move into a calm, private space for counsellor conversations and guided next steps.",
    points: ["Private message flow", "Available counsellor sheet", "Safe conversation cues"],
    icon: MessageCircle,
    accent: "bg-emerald-700 text-white",
    surface: "linear-gradient(135deg, #effaf3 0%, #ffffff 100%)"
  },
  {
    title: "Profile",
    kicker: "04 Account support",
    body: "Make personal settings, resources, and support actions feel easy to find without leaving the app.",
    points: ["Wellness tip card", "Quick support actions", "Profile-centered navigation"],
    icon: UserRound,
    accent: "bg-slate-800 text-white",
    surface: "linear-gradient(135deg, #eef2f3 0%, #fff8e5 100%)"
  }
] as const;

export function SupportPathwaySection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [selectedPhoneIndex, setSelectedPhoneIndex] = useState<number | null>(null);
  const scrollProgress = useScrollProgress(sectionRef);
  const reducedMotion = usePrefersReducedMotion();
  const compactViewport = useMediaQuery("(max-width: 767px)");
  const progress = reducedMotion ? 0.36 : scrollProgress;
  const showcaseProgress = progressBetween(progress, 0.18, 0.82);
  const journeyProgress = reducedMotion ? 0 : showcaseProgress * (featureSlides.length - 1);
  const scrollActiveIndex = Math.min(featureSlides.length - 1, Math.max(0, Math.round(journeyProgress)));
  const phoneJourneyProgress = selectedPhoneIndex ?? journeyProgress;
  const phoneActiveIndex = selectedPhoneIndex ?? scrollActiveIndex;
  const exitProgress = reducedMotion ? 0 : easeInOutCubic(progressBetween(progress, 0.82, 0.98));
  const phoneRevealProgress = reducedMotion ? 1 : easeOutCubic(progressBetween(progress, 0.06, 0.28));
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
          <div className="relative flex h-full min-h-0 items-center justify-center">
            <PhoneGlowBackdrop
              revealProgress={phoneRevealProgress}
              exitProgress={exitProgress}
              reducedMotion={reducedMotion}
            />
            <PhoneMockup
              activeIndex={phoneActiveIndex}
              journeyProgress={phoneJourneyProgress}
              revealProgress={phoneRevealProgress}
              exitProgress={exitProgress}
              compactViewport={compactViewport}
              reducedMotion={reducedMotion}
              onSelectScreen={setSelectedPhoneIndex}
            />
          </div>

          <div className="relative h-full min-h-0">
            <FeatureCopyStack
              activeIndex={scrollActiveIndex}
              journeyProgress={journeyProgress}
              revealProgress={phoneRevealProgress}
              exitProgress={exitProgress}
              reducedMotion={reducedMotion}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function PhoneGlowBackdrop({
  revealProgress,
  exitProgress,
  reducedMotion
}: {
  revealProgress: number;
  exitProgress: number;
  reducedMotion: boolean;
}) {
  const reveal = reducedMotion ? 1 : easeOutQuint(revealProgress);
  const shellStyle: CSSProperties = {
    opacity: reveal * (1 - exitProgress) * 0.92,
    filter: `blur(${lerp(8, 0, reveal)}px)`,
    transform: `translate3d(-50%, calc(-50% + ${lerp(30, -6, reveal)}px), 0) scale(${lerp(0.9, 1, reveal)})`,
    willChange: reducedMotion ? undefined : "transform, opacity, filter"
  };

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 z-0 aspect-[0.82] w-[min(82vw,520px)] -translate-y-1/2 lg:w-[min(39vw,560px)]"
      style={shellStyle}
      aria-hidden="true"
    >
      <div className="absolute inset-[-18%] rounded-full bg-[radial-gradient(circle_at_50%_42%,rgba(165,243,191,0.34),rgba(244,238,215,0.24)_34%,transparent_70%)] blur-2xl" />
      <div className="absolute inset-x-[19%] bottom-[3%] h-12 rounded-full bg-menorah-green/16 blur-2xl" />
    </div>
  );
}

function PhoneMockup({
  activeIndex,
  journeyProgress,
  revealProgress,
  exitProgress,
  compactViewport,
  reducedMotion,
  onSelectScreen
}: {
  activeIndex: number;
  journeyProgress: number;
  revealProgress: number;
  exitProgress: number;
  compactViewport: boolean;
  reducedMotion: boolean;
  onSelectScreen: (index: number) => void;
}) {
  const [discoverMode, setDiscoverMode] = useState<"articles" | "counsellors">("articles");
  const [bookingTab, setBookingTab] = useState<"upcoming" | "completed">("upcoming");
  const [chatFilter, setChatFilter] = useState<"all" | "unread" | "counsellors">("all");
  const smoothReveal = reducedMotion ? 1 : easeOutQuint(revealProgress);
  const phoneStyle: CSSProperties = {
    opacity: smoothReveal * (1 - exitProgress),
    filter: `blur(${lerp(6, 0, smoothReveal)}px) drop-shadow(0 ${lerp(12, 46, smoothReveal)}px ${lerp(
      24,
      78,
      smoothReveal
    )}px rgba(6,16,11,0.42))`,
    transform: `translate3d(0, ${lerp(
      compactViewport ? 42 : 58,
      compactViewport ? -6 : -12,
      smoothReveal
    )}px, 0) rotateZ(0deg) scale(${lerp(compactViewport ? 0.9 : 0.92, 1.04, smoothReveal)})`,
    transformOrigin: "bottom center",
    willChange: reducedMotion ? undefined : "transform, opacity, filter"
  };

  return (
    <div
      data-menorah-landing-theme="source"
      className="relative z-10 mx-auto aspect-[9/18.7] w-[min(58vw,270px)] max-w-[290px] sm:w-[min(48vw,330px)] lg:w-[min(31vw,390px)] lg:max-w-[390px]"
      style={phoneStyle}
      aria-label={`Menorah app example: ${featureSlides[activeIndex].title}`}
    >
      <div className="absolute -inset-8 rounded-[3rem] bg-[radial-gradient(circle_at_50%_28%,rgba(165,243,191,0.24),transparent_58%)] blur-2xl" />
      <span className="absolute -left-1 top-[18%] z-20 h-16 w-1 rounded-l-full bg-gradient-to-b from-slate-700 via-slate-950 to-slate-700" />
      <span className="absolute -right-1 top-[16%] z-20 h-11 w-1 rounded-r-full bg-gradient-to-b from-slate-600 via-slate-950 to-slate-700" />
      <span className="absolute -right-1 top-[27%] z-20 h-20 w-1 rounded-r-full bg-gradient-to-b from-slate-600 via-slate-950 to-slate-700" />

      <div className="absolute inset-0 rounded-[2.15rem] bg-[linear-gradient(135deg,#1f2937_0%,#020508_22%,#020508_72%,#334155_100%)] p-[5px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14),inset_0_-18px_34px_rgba(255,255,255,0.05)] ring-1 ring-black/70 sm:rounded-[2.55rem]">
        <div className="absolute inset-[3px] rounded-[2rem] border border-white/[0.08] sm:rounded-[2.38rem]" />
        <div className="relative h-full overflow-hidden rounded-[1.75rem] bg-[#f9fafb] ring-1 ring-inset ring-black/[0.07] sm:rounded-[2.1rem]">
          <div className="absolute left-1/2 top-2 z-40 flex h-7 w-[7.1rem] -translate-x-1/2 items-center justify-center rounded-full bg-black shadow-[inset_0_1px_1px_rgba(255,255,255,0.16),0_1px_2px_rgba(0,0,0,0.5)] sm:h-7 sm:w-32">
            <span className="absolute right-3 h-2 w-2 rounded-full bg-[#111827] ring-1 ring-white/[0.08]" />
          </div>
          <div className="absolute inset-x-0 top-0 z-30 flex h-12 items-end justify-between bg-white/78 px-5 pb-2 text-[10px] font-semibold text-gray-950 backdrop-blur-sm">
            <span>2:21</span>
            <StatusIcons />
          </div>
          <div className="absolute inset-0 pt-12">
            {featureSlides.map((feature, index) => {
              const delta = reducedMotion ? index : index - journeyProgress;
              const distance = Math.abs(delta);
              const focus = 1 - smoothstep(0.04, 0.76, distance);
              const screenStyle: CSSProperties = {
                opacity: focus * focus,
                filter: `blur(${lerp(8, 0, focus)}px)`,
                transform: `translate3d(${lerp(42, 0, focus) * Math.sign(delta || 1)}px, ${lerp(
                  16,
                  0,
                  focus
                )}px, 0) scale(${lerp(0.94, 1, focus)})`,
                zIndex: 10 + Math.round(focus * 10),
                willChange: reducedMotion ? undefined : "transform, opacity, filter"
              };

              return (
                <div key={feature.title} className="absolute inset-0" style={screenStyle} aria-hidden={index !== activeIndex}>
                  <PhoneScreen
                    index={index}
                    activeIndex={activeIndex}
                    onSelectScreen={onSelectScreen}
                    discoverMode={discoverMode}
                    setDiscoverMode={setDiscoverMode}
                    bookingTab={bookingTab}
                    setBookingTab={setBookingTab}
                    chatFilter={chatFilter}
                    setChatFilter={setChatFilter}
                  />
                </div>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-0 z-50 bg-[linear-gradient(115deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.04)_24%,rgba(255,255,255,0)_44%)]" />
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-50 h-1 w-24 -translate-x-1/2 rounded-full bg-gray-950/24" />
        </div>
      </div>
    </div>
  );
}

function PhoneScreen({
  index,
  activeIndex,
  onSelectScreen,
  discoverMode,
  setDiscoverMode,
  bookingTab,
  setBookingTab,
  chatFilter,
  setChatFilter
}: {
  index: number;
  activeIndex: number;
  onSelectScreen: (index: number) => void;
  discoverMode: "articles" | "counsellors";
  setDiscoverMode: (mode: "articles" | "counsellors") => void;
  bookingTab: "upcoming" | "completed";
  setBookingTab: (tab: "upcoming" | "completed") => void;
  chatFilter: "all" | "unread" | "counsellors";
  setChatFilter: (filter: "all" | "unread" | "counsellors") => void;
}) {
  if (index === 0) {
    return (
      <div className="relative h-full overflow-hidden bg-[#f9fafb] px-4 pb-20 pt-5 text-gray-950">
        <div className="flex items-center justify-between">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 ring-1 ring-primary-200">
            <span className="text-lg font-black text-primary-700">M</span>
          </div>
          <div className="flex items-center gap-2 text-primary-700">
            <IconButton icon={Menu} />
            <IconButton icon={Bell} />
            <IconButton icon={MessageCircle} />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <SearchPill placeholder="Search support, articles, counsellors..." />
          <button className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary-100 bg-white text-primary-700 shadow-sm">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-[1.35rem] border border-primary-100 bg-white shadow-[0_18px_45px_rgba(45,122,92,0.12)]">
          <div className="flex min-h-[8.2rem] flex-col justify-end bg-[radial-gradient(circle_at_20%_20%,rgba(187,247,208,0.64),transparent_36%),linear-gradient(135deg,rgba(240,249,244,0.96),rgba(255,255,255,0.92))] p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary-700">Menorah</p>
            <h3 className="mt-1 text-2xl font-black leading-tight">Mind Over Matter, Redefined</h3>
            <p className="mt-2 text-xs font-semibold text-gray-600">A calmer place to begin the conversation.</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-[1.2rem] border border-primary-100 bg-primary-50 p-3">
          <div>
            <h4 className="text-xl font-black leading-none">Chat with us</h4>
            <p className="mt-2 line-clamp-2 text-[11px] font-semibold leading-4 text-gray-600">
              Speak with a trained clinical psychology student.
            </p>
          </div>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-primary-700 ring-[10px] ring-primary-100">
            <MessageCircle className="h-7 w-7" aria-hidden="true" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <h4 className="text-xl font-black">Read Articles</h4>
          <button
            type="button"
            onClick={() => setDiscoverMode(discoverMode === "articles" ? "counsellors" : "articles")}
            className="rounded-full px-2 py-1 text-xs font-black text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          >
            {discoverMode === "articles" ? "Counsellors" : "Articles"}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(discoverMode === "articles" ? ["Stress", "Sleep"] : ["Rayan", "Ayaan"]).map((label) => (
            <button
              type="button"
              key={label}
              onClick={() => setDiscoverMode(discoverMode === "articles" ? "counsellors" : "articles")}
              className="h-24 rounded-[1.1rem] border border-primary-100 bg-white p-3 text-left shadow-sm transition hover:border-primary-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              <span className="rounded-full bg-primary-100 px-2 py-1 text-[9px] font-black uppercase text-primary-700">
                {label}
              </span>
              <span className="mt-4 block text-xs font-semibold leading-4 text-gray-500">
                {discoverMode === "articles" ? "Tap to preview support resources" : "Tap to compare a counsellor"}
              </span>
            </button>
          ))}
        </div>

        <AppBottomNav active="Discover" activeIndex={activeIndex} onSelect={onSelectScreen} />
      </div>
    );
  }

  if (index === 2) {
    const chatRows =
      chatFilter === "counsellors"
        ? [
            ["test counsellor1", "stress management", "Chat", "T"],
            ["test counsellor2", "anxiety issues", "Chat", "T"],
            ["Jayden Jacob", "CEO testing", "Chat", "J"]
          ]
        : chatFilter === "unread"
          ? [["test counsellor2", "wasssap", "1:32 AM", "T"]]
          : [
              ["test counsellor2", "wasssap", "1:32 AM", "T"],
              ["Jayden Jacob", "Hello", "1:31 AM", "J"],
              ["test counsellor1", "hi", "4:59 PM", "T"]
            ];

    return (
      <div className="relative h-full overflow-hidden bg-[#f9fafb] px-4 pb-20 pt-5 text-gray-950">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[2rem] font-black leading-none">Messages</h3>
            <p className="mt-1 text-sm font-medium text-gray-500">Chat with your counsellors</p>
          </div>
          <button className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-[0_16px_32px_-20px_rgba(45,122,92,0.7)]">
            <Plus className="h-7 w-7" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <SearchPill placeholder="Search counsellor or messages" />
          <button className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary-100 bg-white text-primary-700 shadow-sm">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 flex gap-2 overflow-hidden">
          {[
            ["All", MessageCircle, "all"],
            ["Unread", BookOpen, "unread"],
            ["Counsellors", UserRound, "counsellors"]
          ].map(([label, Icon, filter]) => (
            <FilterChip
              key={String(label)}
              label={String(label)}
              icon={Icon as LucideIcon}
              active={chatFilter === filter}
              onClick={() => setChatFilter(filter as "all" | "unread" | "counsellors")}
            />
          ))}
        </div>

        <div className="mt-4 rounded-[1.2rem] border border-primary-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-50 text-primary-700">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-primary-700 ring-[10px] ring-primary-50">
              <LockKeyhole className="h-7 w-7" aria-hidden="true" />
            </div>
          </div>
          <h4 className="mt-3 text-base font-black">Safe. Private. Personal.</h4>
          <p className="mt-1 text-xs leading-5 text-gray-500">Your conversations are end-to-end encrypted and confidential.</p>
        </div>

        <div className="mt-4 rounded-[1.2rem] border border-primary-100 bg-white shadow-sm">
          {chatRows.map(([name, preview, time, initial], itemIndex) => (
            <button
              type="button"
              key={name}
              className={cn(
                "flex w-full items-center gap-3 p-4 text-left transition hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary-500",
                itemIndex > 0 && "border-t border-primary-100"
              )}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-lg font-black text-primary-700">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{name}</p>
                <p className="truncate text-xs text-gray-500">{preview}</p>
              </div>
              <span className="text-[11px] font-bold text-gray-400">{time}</span>
            </button>
          ))}
        </div>

        <AppBottomNav active="Chat" activeIndex={activeIndex} onSelect={onSelectScreen} />
      </div>
    );
  }

  if (index === 1) {
    const activeBooking =
      bookingTab === "upcoming"
        ? ["Awaiting Assignment", "Counsellor will be assigned soon", "Upcoming"]
        : ["Session Completed", "Rayan Khalid - stress support", "Completed"];

    return (
      <div className="relative h-full overflow-hidden bg-[#f9fafb] px-4 pb-20 pt-5 text-gray-950">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[1.9rem] font-black leading-none">My Bookings</h3>
            <p className="mt-1 text-sm font-medium text-gray-500">Manage sessions and appointments</p>
          </div>
          <button className="flex h-12 w-12 items-center justify-center rounded-full border border-primary-100 bg-white text-primary-700 shadow-sm">
            <CalendarPlus className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 rounded-full border border-primary-100 bg-white p-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => setBookingTab("upcoming")}
            className={cn(
              "flex h-12 items-center justify-center gap-2 rounded-full text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
              bookingTab === "upcoming" ? "bg-primary-600 text-white" : "text-gray-500"
            )}
            aria-pressed={bookingTab === "upcoming"}
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Upcoming
          </button>
          <button
            type="button"
            onClick={() => setBookingTab("completed")}
            className={cn(
              "flex h-12 items-center justify-center gap-2 rounded-full text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
              bookingTab === "completed" ? "bg-primary-600 text-white" : "text-gray-500"
            )}
            aria-pressed={bookingTab === "completed"}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Completed
          </button>
        </div>

        <div className="mt-6 rounded-[1.35rem] border border-primary-100 bg-white p-4 shadow-[0_18px_45px_rgba(45,122,92,0.12)]">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700">
              <UserRound className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-base font-black">{activeBooking[0]}</h4>
              <p className="mt-1 text-sm leading-5 text-gray-500">{activeBooking[1]}</p>
            </div>
            <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-black text-primary-700">
              {activeBooking[2]}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-xs font-medium text-gray-500">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
              </span>
              Instant session
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
              </span>
              Online - Video
            </div>
          </div>
        </div>

        <div className="mt-6 h-28 rounded-[1.35rem] border border-primary-100 bg-[linear-gradient(135deg,rgba(240,249,244,0.96),rgba(255,255,255,0.92))]" />

        <AppBottomNav active="Bookings" activeIndex={activeIndex} onSelect={onSelectScreen} />
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden bg-[#f9fafb] px-4 pb-20 pt-5 text-gray-950">
      <div className="flex items-center justify-between">
        <button className="flex h-12 w-12 items-center justify-center rounded-full border border-primary-100 bg-white text-primary-700 shadow-sm">
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
        <div className="text-center">
          <h3 className="text-2xl font-black text-primary-700">Profile</h3>
          <p className="text-xs font-black text-gray-500">Settings and support</p>
        </div>
        <button className="flex h-12 w-12 items-center justify-center rounded-full border border-primary-100 bg-white text-primary-700 shadow-sm">
          <UserRound className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-5 rounded-[1.35rem] border border-primary-100 bg-white p-4 shadow-[0_18px_45px_rgba(45,122,92,0.12)]">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-primary-100 bg-primary-50 text-3xl font-black text-primary-700">
            T
          </div>
          <div className="min-w-0">
            <h4 className="text-2xl font-black leading-none">tej Raj</h4>
            <p className="mt-2 truncate text-sm text-gray-500">tejasamirth@gmail.com</p>
            <span className="mt-3 inline-flex rounded-full bg-primary-100 px-3 py-2 text-xs font-black text-primary-700">
              Member since June 2026
            </span>
          </div>
        </div>

        <div className="mt-6 flex gap-3 rounded-[1.1rem] bg-primary-50 p-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-primary-700 shadow-sm">
            <HeartPulse className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h5 className="font-black">Wellness Tip</h5>
            <p className="mt-1 text-sm leading-5 text-gray-600">Small steps every day lead to big changes.</p>
          </div>
        </div>
      </div>

      <h4 className="mt-5 text-xl font-black">Quick Actions</h4>
      <div className="mt-3 space-y-3">
        {[
          { title: "Book a session", subtitle: "Start your wellness journey", icon: CalendarDays },
          { title: "Resources", subtitle: "Articles and support", icon: BookOpen },
          { title: "Get support", subtitle: "We are here to help", icon: MessageCircle }
        ].map((action) => {
          const Icon = action.icon;

          return (
            <div
              key={action.title}
              className="flex items-center gap-3 rounded-[1.15rem] border border-primary-100 bg-white p-3 shadow-sm"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-base font-black">{action.title}</p>
                <p className="mt-1 text-xs text-gray-500">{action.subtitle}</p>
              </div>
            </div>
          );
        })}
      </div>

      <AppBottomNav active="Profile" activeIndex={activeIndex} onSelect={onSelectScreen} />
    </div>
  );
}

function IconButton({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary-100 bg-white text-primary-700 shadow-sm">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

function StatusIcons() {
  return (
    <span className="flex items-end gap-1" aria-hidden="true">
      <span className="flex h-3.5 items-end gap-0.5">
        {[5, 7, 9, 11].map((height) => (
          <span key={height} className="w-1 rounded-full bg-gray-950/80" style={{ height }} />
        ))}
      </span>
      <span className="relative h-3 w-4 overflow-hidden">
        <span className="absolute left-1/2 top-0 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-gray-950/80" />
        <span className="absolute left-1/2 top-2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-gray-950/80" />
        <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-gray-950/80" />
      </span>
      <span className="flex h-3 w-5 items-center rounded-[3px] border border-gray-950/70 px-0.5">
        <span className="h-1.5 flex-1 rounded-[2px] bg-primary-500" />
      </span>
    </span>
  );
}

function SearchPill({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full border border-primary-100 bg-white px-3 text-gray-400 shadow-sm">
      <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="truncate text-sm font-medium">{placeholder}</span>
    </div>
  );
}

function FilterChip({
  label,
  icon: Icon,
  active,
  onClick
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
        active
          ? "border-primary-600 bg-primary-600 text-white"
          : "border-primary-100 bg-white text-gray-500"
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function AppBottomNav({
  active,
  activeIndex,
  onSelect
}: {
  active: "Discover" | "Bookings" | "Chat" | "Profile";
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const items = [
    { label: "Discover", icon: Search, index: 0 },
    { label: "Bookings", icon: CalendarDays, index: 1 },
    { label: "Chat", icon: MessageCircle, index: 2 },
    { label: "Profile", icon: UserRound, index: 3 }
  ] as const;

  return (
    <div className="absolute inset-x-3 bottom-3 z-30 grid h-[4.5rem] grid-cols-4 rounded-[1.65rem] border border-primary-100 bg-white/95 p-1.5 shadow-[0_18px_45px_rgba(45,122,92,0.16)] backdrop-blur-md">
      {items.map((item) => {
        const Icon = item.icon;
        const selected = item.label === active || item.index === activeIndex;

        return (
          <button
            type="button"
            key={item.label}
            onClick={() => onSelect(item.index)}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            aria-pressed={selected}
            aria-label={`Show ${item.label} mobile demo`}
          >
            <span
              className={cn(
                "flex h-9 w-12 items-center justify-center rounded-full transition",
                selected ? "bg-primary-600 text-white shadow-[0_10px_24px_-14px_rgba(45,122,92,0.85)]" : "text-gray-400"
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className={selected ? "text-primary-700" : "text-gray-400"}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FeatureCopyStack({
  activeIndex,
  journeyProgress,
  revealProgress,
  exitProgress,
  reducedMotion
}: {
  activeIndex: number;
  journeyProgress: number;
  revealProgress: number;
  exitProgress: number;
  reducedMotion: boolean;
}) {
  const reveal = reducedMotion ? 1 : easeOutQuint(revealProgress);
  const entranceStyle: CSSProperties = {
    opacity: reveal,
    filter: `blur(${lerp(5, 0, reveal)}px)`,
    transform: `translate3d(0, ${lerp(34, -4, reveal)}px, 0) scale(${lerp(0.97, 1, reveal)})`,
    transformOrigin: "center",
    willChange: reducedMotion ? undefined : "transform, opacity, filter"
  };

  return (
    <div
      className="relative flex h-full min-h-0 items-start justify-center pt-1 md:items-center md:pt-0 lg:justify-start"
      style={entranceStyle}
    >
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

function easeOutQuint(progress: number) {
  return 1 - Math.pow(1 - progress, 5);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
