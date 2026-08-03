"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, HeartPulse, MessageCircle, Pause, Play, Search, ShieldCheck, Users } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import type { Counsellor } from "@/types";

type DirectoryFilter = "All" | "Consultant Psychologist" | "Clinical Psychologist" | "Sexual Health" | "Psychiatrist";
type DirectoryCategory = Exclude<DirectoryFilter, "All">;

type DirectoryProfile = {
  id: string;
  name: string;
  role: string;
  category: DirectoryCategory;
  specialties: string[];
  language: string;
  hours: string;
  feeLabel: string;
  feeUnit: string;
  availability: string;
  initials: string;
  profileImage?: string;
  voiceIntroUrl?: string;
  voiceIntroDurationSeconds?: number;
  searchableText: string;
};

const filterOptions = [
  { label: "All support", value: "All", icon: Users },
  { label: "Consultant Psychologist", value: "Consultant Psychologist", icon: MessageCircle },
  { label: "Clinical Psychologist", value: "Clinical Psychologist", icon: ShieldCheck },
  { label: "Sexual Health", value: "Sexual Health", icon: HeartPulse },
  { label: "Psychiatrist", value: "Psychiatrist", icon: BookOpen }
] as const;

const waveformBars = [14, 24, 32, 18, 28, 38, 22, 34, 26, 42, 30, 20, 36, 44, 24, 34, 28, 40, 22, 32, 38, 26, 30, 18];
const skeletonCards = [0, 1, 2, 3, 4, 5];
const INITIAL_PROFILE_COUNT = 6;
const LOAD_MORE_COUNT = 3;
const DIRECTORY_PROFILE_LIMIT = 50;
const DAY_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function SupportDirectoryPreviewSection() {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<(typeof filterOptions)[number]["value"]>("All");
  const [visibleCount, setVisibleCount] = useState(INITIAL_PROFILE_COUNT);
  const [profiles, setProfiles] = useState<DirectoryProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadProductionCounsellors() {
      setIsLoading(true);
      setErrorMessage(null);

      const response = await api.getCounsellors({
        page: 1,
        limit: DIRECTORY_PROFILE_LIMIT,
        sortBy: "rating",
        sortOrder: "desc"
      });

      if (!isCurrent) {
        return;
      }

      if (!response.success) {
        setProfiles([]);
        setErrorMessage(response.message || "Unable to load production support profiles.");
        setIsLoading(false);
        return;
      }

      setProfiles((response.data?.counsellors ?? []).map(mapCounsellorToDirectoryProfile));
      setIsLoading(false);
    }

    loadProductionCounsellors().catch((error: unknown) => {
      if (!isCurrent) {
        return;
      }

      setProfiles([]);
      setErrorMessage(error instanceof Error ? error.message : "Unable to load production support profiles.");
      setIsLoading(false);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  const visibleProfiles = useMemo(() => {
    const normalizedQuery = normalizeText(query);

    return profiles.filter((profile) => {
      const matchesFilter =
        activeFilter === "All" ||
        profile.category === activeFilter ||
        normalizeText(profile.role).includes(normalizeText(activeFilter));
      const matchesSearch = !normalizedQuery || profile.searchableText.includes(normalizedQuery);
      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, profiles, query]);

  const displayedProfiles = visibleProfiles.slice(0, visibleCount);
  const remainingProfiles = Math.max(visibleProfiles.length - displayedProfiles.length, 0);
  const hasActiveRefinement = Boolean(query.trim()) || activeFilter !== "All";
  const emptyMessage = errorMessage
    ? "Unable to load production support profiles right now."
    : hasActiveRefinement
      ? "No matching support profiles found."
      : "No production support profiles are available yet.";

  return (
    <section
      id="support-directory"
      aria-labelledby="support-directory-title"
      className="relative min-h-screen overflow-hidden bg-[#fbfbfa] px-[var(--landing-page-x)] py-[var(--landing-section-y-tight)] text-[#0f172a]"
    >
      <h2 id="support-directory-title" className="sr-only">
        Menorah support directory preview
      </h2>

      <div className="mx-auto w-[var(--landing-container)]">
        <div className="flex flex-col gap-[clamp(0.5rem,1vw,0.8rem)] rounded-[var(--landing-radius-md)] border border-[#dde1da] bg-[#fff] p-[clamp(0.45rem,0.7vw,0.75rem)] shadow-[0_18px_60px_rgba(35,45,36,0.08)] lg:flex-row lg:items-center">
          <label className="relative min-w-0 lg:w-[clamp(19rem,24vw,25rem)] lg:flex-none" htmlFor="support-directory-search">
            <span className="sr-only">Search by support name or specialty</span>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#5f6871]"
              aria-hidden="true"
            />
            <input
              id="support-directory-search"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleCount(INITIAL_PROFILE_COUNT);
              }}
              placeholder="Search by support name"
              className="h-[var(--landing-button-h)] w-full rounded-[var(--landing-radius-sm)] border border-[#d9ddd6] bg-[#fff] pl-12 pr-4 text-[length:var(--landing-button-text)] font-medium text-[#0f172a] outline-none transition placeholder:text-[#a2a9ad] focus:border-menorah-green/45 focus:ring-4 focus:ring-menorah-green/10"
            />
          </label>

          <div className="flex gap-[clamp(0.45rem,0.8vw,0.75rem)] overflow-x-auto pb-1 lg:overflow-visible lg:pb-0" aria-label="Directory filters">
            {filterOptions.map((filter) => {
              const Icon = filter.icon;
              const selected = activeFilter === filter.value;

              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => {
                    setActiveFilter(filter.value);
                    setVisibleCount(INITIAL_PROFILE_COUNT);
                  }}
                  className={cn(
                    "flex h-[var(--landing-button-h)] shrink-0 items-center gap-2 rounded-[var(--landing-radius-sm)] border px-[var(--landing-button-x)] text-[length:var(--landing-button-text)] font-semibold transition focus:outline-none focus:ring-4 focus:ring-menorah-green/12",
                    selected
                      ? "border-menorah-green bg-menorah-green text-white shadow-[0_12px_28px_rgba(46,72,46,0.18)]"
                      : "border-[#d9ddd6] bg-[#fff] text-[#1f2937] hover:border-menorah-green/35 hover:bg-menorah-green/5"
                  )}
                  aria-pressed={selected}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{filter.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div id="support-directory-results" className="mt-[var(--landing-stack-gap)] grid grid-cols-1 gap-[clamp(1rem,1.6vw,1.5rem)] md:grid-cols-2 xl:grid-cols-3">
          {isLoading
            ? skeletonCards.map((index) => <DirectoryCardSkeleton key={index} />)
            : displayedProfiles.map((profile) => <DirectoryCard key={profile.id} profile={profile} />)}
        </div>

        {!isLoading && visibleProfiles.length > 0 ? (
          <div className="mt-[clamp(1.75rem,3vw,2.75rem)] flex justify-center">
            {remainingProfiles > 0 ? (
              <button
                type="button"
                aria-controls="support-directory-results"
                aria-label="Load more consultants"
                onClick={() => setVisibleCount((count) => count + LOAD_MORE_COUNT)}
                className="inline-flex min-h-[var(--landing-button-h)] items-center justify-center rounded-full bg-menorah-green px-[clamp(1.35rem,1.35vw,2.6rem)] text-[length:var(--landing-button-text)] font-semibold text-white shadow-[0_14px_32px_rgba(46,72,46,0.18)] transition hover:scale-[1.02] hover:bg-menorah-olive focus:outline-none focus:ring-4 focus:ring-menorah-green/15"
              >
                Load More
              </button>
            ) : null}
          </div>
        ) : null}

        {!isLoading && visibleProfiles.length === 0 ? (
          <div className="mt-[var(--landing-stack-gap)] rounded-[var(--landing-radius-md)] border border-menorah-green/12 bg-[#fff] p-[var(--landing-card-pad-lg)] text-center text-[length:var(--landing-body-sm)] font-medium text-[#4b5563]">
            {emptyMessage}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DirectoryCard({ profile }: { profile: DirectoryProfile }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const hasVoiceIntro = Boolean(profile.voiceIntroUrl);

  const toggleVoiceIntro = async () => {
    if (!hasVoiceIntro || !audioRef.current) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        return;
      }

      await audioRef.current.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  return (
    <article className="group overflow-hidden rounded-[var(--landing-radius-md)] border border-[#dfe3dd] bg-[#fff] shadow-[0_14px_45px_rgba(35,45,36,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(35,45,36,0.12)]">
      <div className="directory-wave-header relative h-[clamp(7rem,8.5vw,9.5rem)] overflow-hidden px-[var(--landing-card-pad)] pt-[clamp(1rem,1.5vw,1.4rem)]">
        <div className="relative z-10 max-w-[68%]">
          <h3 className="text-[length:var(--landing-card-title)] font-semibold leading-tight text-white">{profile.name}</h3>
          <p className="mt-1 text-[length:var(--landing-kicker)] font-medium text-white/86">{profile.role}</p>
        </div>
        <div className="absolute bottom-[clamp(0.85rem,1.2vw,1.25rem)] right-[var(--landing-card-pad)] z-10 flex h-[clamp(5rem,6.5vw,6.75rem)] w-[clamp(5rem,6.5vw,6.75rem)] items-center justify-center overflow-hidden rounded-full border border-white/35 bg-[#ffffff]/25 text-[clamp(1.35rem,1.7vw,2rem)] font-semibold text-menorah-green shadow-[0_14px_35px_rgba(0,0,0,0.12)]">
          {profile.profileImage ? (
            <img src={profile.profileImage} alt="" className="h-full w-full object-cover" />
          ) : (
            profile.initials
          )}
        </div>
      </div>

      <div className="-mt-4 rounded-t-[var(--landing-radius-md)] bg-[#fff] px-[var(--landing-card-pad)] pb-[var(--landing-card-pad)] pt-[clamp(1rem,1.5vw,1.4rem)]">
        <div className="flex gap-2 overflow-hidden border-b border-[#e3e7e0] pb-4">
          {profile.specialties.map((specialty) => (
            <span
              key={specialty}
              className="shrink-0 rounded-[var(--landing-radius-sm)] border border-[#d9ddd6] bg-[#fff] px-[clamp(0.65rem,0.8vw,0.9rem)] py-[clamp(0.45rem,0.6vw,0.65rem)] text-[clamp(0.68rem,calc(0.18vw_+_0.62rem),0.8rem)] font-medium text-[#0f172a] shadow-[0_4px_12px_rgba(15,23,42,0.04)]"
            >
              {specialty}
            </span>
          ))}
        </div>

        <div className="mt-[clamp(0.9rem,1.2vw,1.15rem)] flex items-center gap-[clamp(0.65rem,1vw,0.9rem)] border-b border-[#e3e7e0] pb-[clamp(0.9rem,1.2vw,1.15rem)]">
          <button
            type="button"
            className="flex h-[var(--landing-icon-sm)] w-[var(--landing-icon-sm)] shrink-0 items-center justify-center rounded-full bg-[#1f2933] text-white transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={toggleVoiceIntro}
            disabled={!hasVoiceIntro}
            aria-label={hasVoiceIntro ? `${isPlaying ? "Pause" : "Play"} ${profile.name} voice intro` : `${profile.name} has no voice intro`}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-current" aria-hidden="true" />
            ) : (
              <Play className="h-5 w-5 fill-current" aria-hidden="true" />
            )}
          </button>
          {hasVoiceIntro && (
            <audio ref={audioRef} src={profile.voiceIntroUrl} preload="none" onEnded={() => setIsPlaying(false)} />
          )}
          <div className="flex h-[clamp(2.75rem,3.2vw,3.4rem)] min-w-0 flex-1 items-center gap-1 rounded-[var(--landing-radius-sm)] border border-[#d9ddd6] bg-[#fafafa] px-[clamp(0.65rem,0.9vw,0.9rem)]">
            <Waveform />
          </div>
          <Link
            href={`/counsellor/${profile.id}`}
            className="inline-flex h-[var(--landing-button-h)] shrink-0 items-center justify-center rounded-full border border-[#0f172a] bg-[#fff] px-[var(--landing-button-x)] text-[length:var(--landing-kicker)] font-semibold text-[#0f172a] transition hover:bg-[#0f172a] hover:text-white"
          >
            View Profile
          </Link>
        </div>

        <div className="mt-[clamp(0.9rem,1.2vw,1.15rem)] grid grid-cols-3 gap-[clamp(0.4rem,0.6vw,0.6rem)]">
          <StatBlock label="Therapy hrs" value={profile.hours} />
          <StatBlock label="Languages" value={profile.language} />
          <StatBlock label={profile.feeUnit} value={profile.feeLabel} />
        </div>

        <div className="mt-[clamp(0.9rem,1.2vw,1.15rem)] flex items-end justify-between gap-[clamp(0.85rem,1.2vw,1.2rem)] border-t border-[#e3e7e0] pt-[clamp(0.9rem,1.2vw,1.15rem)]">
          <div className="min-w-0">
            <p className="text-[length:var(--landing-kicker)] text-[#a1a8ad]">Next available in</p>
            <p className="mt-1 truncate text-[length:var(--landing-body-sm)] font-semibold text-[#0f172a]">{profile.availability}</p>
          </div>
          <Link
            href={`/bookings/new?counsellorId=${profile.id}`}
            className="inline-flex h-[var(--landing-button-h)] shrink-0 items-center justify-center rounded-full bg-menorah-green px-[clamp(1.1rem,1.15vw,2rem)] text-[length:var(--landing-kicker)] font-semibold uppercase tracking-[0.08em] text-white transition hover:scale-[1.03] hover:bg-menorah-olive focus:outline-none focus:ring-4 focus:ring-menorah-green/15"
          >
            Book Now
          </Link>
        </div>
      </div>
    </article>
  );
}

function DirectoryCardSkeleton() {
  return (
    <article className="animate-pulse overflow-hidden rounded-[var(--landing-radius-md)] border border-[#dfe3dd] bg-[#fff] shadow-[0_14px_45px_rgba(35,45,36,0.08)]" aria-hidden="true">
      <div className="directory-wave-header relative h-[clamp(7rem,8.5vw,9.5rem)] overflow-hidden px-[var(--landing-card-pad)] pt-[clamp(1rem,1.5vw,1.4rem)] opacity-70">
        <div className="h-7 w-1/2 rounded-full bg-white/60" />
        <div className="mt-3 h-3 w-2/5 rounded-full bg-white/45" />
        <div className="absolute bottom-[clamp(0.85rem,1.2vw,1.25rem)] right-[var(--landing-card-pad)] h-[clamp(5rem,6.5vw,6.75rem)] w-[clamp(5rem,6.5vw,6.75rem)] rounded-full bg-white/30" />
      </div>
      <div className="-mt-4 rounded-t-[var(--landing-radius-md)] bg-[#fff] px-[var(--landing-card-pad)] pb-[var(--landing-card-pad)] pt-[clamp(1rem,1.5vw,1.4rem)]">
        <div className="flex gap-2 border-b border-[#e3e7e0] pb-4">
          <span className="h-10 w-24 rounded-[var(--landing-radius-sm)] bg-[#edf0ec]" />
          <span className="h-10 w-28 rounded-[var(--landing-radius-sm)] bg-[#edf0ec]" />
          <span className="h-10 w-24 rounded-[var(--landing-radius-sm)] bg-[#edf0ec]" />
        </div>
        <div className="mt-[clamp(0.9rem,1.2vw,1.15rem)] flex items-center gap-[clamp(0.65rem,1vw,0.9rem)] border-b border-[#e3e7e0] pb-[clamp(0.9rem,1.2vw,1.15rem)]">
          <span className="h-[var(--landing-icon-sm)] w-[var(--landing-icon-sm)] rounded-full bg-[#edf0ec]" />
          <span className="h-[clamp(2.75rem,3.2vw,3.4rem)] flex-1 rounded-[var(--landing-radius-sm)] bg-[#edf0ec]" />
          <span className="h-[var(--landing-button-h)] w-28 rounded-full bg-[#edf0ec]" />
        </div>
        <div className="mt-[clamp(0.9rem,1.2vw,1.15rem)] grid grid-cols-3 gap-[clamp(0.4rem,0.6vw,0.6rem)]">
          <span className="h-20 rounded-[var(--landing-radius-sm)] bg-[#edf0ec]" />
          <span className="h-20 rounded-[var(--landing-radius-sm)] bg-[#edf0ec]" />
          <span className="h-20 rounded-[var(--landing-radius-sm)] bg-[#edf0ec]" />
        </div>
      </div>
    </article>
  );
}

function Waveform() {
  return (
    <div className="flex w-full items-center justify-between gap-0.5" aria-hidden="true">
      {waveformBars.map((height, index) => (
        <span
          key={`${height}-${index}`}
          className="block w-[3px] shrink-0 rounded-full bg-[#b8bec1]"
          style={{ height: `${height}px` }}
        />
      ))}
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[var(--landing-radius-sm)] bg-[#f7f7f6] px-[clamp(0.65rem,0.9vw,0.9rem)] py-[clamp(0.65rem,0.9vw,0.9rem)]">
      <p className="truncate text-[length:var(--landing-body-sm)] font-semibold text-[#0f172a]">{value}</p>
      <p className="mt-1 truncate text-[length:var(--landing-kicker)] text-[#334155]">{label}</p>
    </div>
  );
}

function mapCounsellorToDirectoryProfile(counsellor: Counsellor): DirectoryProfile {
  const name = counsellor.name?.trim() || "Menorah Counsellor";
  const category = inferDirectoryCategory(counsellor);
  const role = counsellor.specialization?.trim() || category;
  const specialties = getSpecialtyTags(counsellor);
  const language = getPrimaryLanguage(counsellor);
  const fee = getFeeCopy(counsellor);
  const searchableText = normalizeText(
    [
      name,
      role,
      category,
      language,
      counsellor.bio,
      ...(Array.isArray(counsellor.specializations) ? counsellor.specializations : []),
      ...specialties
    ]
      .filter(Boolean)
      .join(" ")
  );

  return {
    id: counsellor.id,
    name,
    role,
    category,
    specialties,
    language,
    hours: getTherapyHours(counsellor),
    feeLabel: fee.label,
    feeUnit: fee.unit,
    availability: getNextAvailability(counsellor),
    initials: getProfileInitials(name),
    profileImage: counsellor.profileImage,
    voiceIntroUrl: counsellor.voiceIntroUrl,
    voiceIntroDurationSeconds: counsellor.voiceIntroDurationSeconds,
    searchableText
  };
}

function inferDirectoryCategory(counsellor: Counsellor): DirectoryCategory {
  const source = normalizeText([
    counsellor.specialization,
    ...(Array.isArray(counsellor.specializations) ? counsellor.specializations : [])
  ].join(" "));

  if (hasAnyKeyword(source, ["psychiatrist", "psychiatric", "medication", "pharmacology"])) {
    return "Psychiatrist";
  }

  if (hasAnyKeyword(source, ["sexual", "intimacy", "identity", "body image", "boundaries"])) {
    return "Sexual Health";
  }

  if (hasAnyKeyword(source, ["clinical", "trauma", "ptsd", "depression", "anxiety", "cbt", "emdr", "adhd", "grief", "addiction", "substance"])) {
    return "Clinical Psychologist";
  }

  return "Consultant Psychologist";
}

function getSpecialtyTags(counsellor: Counsellor) {
  const directTags = Array.isArray(counsellor.specializations) ? counsellor.specializations : [];
  const splitTags = counsellor.specialization?.split(/[,/|&]+/) ?? [];
  const tags = [...directTags, ...splitTags]
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, allTags) => allTags.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === index);

  return (tags.length ? tags : ["Mental wellness"]).slice(0, 3);
}

function getPrimaryLanguage(counsellor: Counsellor) {
  const languages = Array.isArray(counsellor.languages) ? counsellor.languages.map((language) => language.trim()).filter(Boolean) : [];
  return languages[0] || "English";
}

function getTherapyHours(counsellor: Counsellor) {
  const totalSessions = toFiniteNumber(counsellor.totalSessions);
  const experienceHours = toFiniteNumber(counsellor.experience) * 120;
  const source = totalSessions > 0 ? totalSessions : experienceHours;
  const rounded = Math.max(50, Math.round(source / 10) * 10);
  return `${rounded}+`;
}

function getFeeCopy(counsellor: Counsellor) {
  const hourlyRate = toFiniteNumber(counsellor.hourlyRate);

  if (hourlyRate <= 0) {
    return { label: "Rate unavailable", unit: "Check profile" };
  }

  try {
    return { label: formatCurrency(hourlyRate, counsellor.currency || "INR"), unit: "Per hour" };
  } catch {
    return { label: `${counsellor.currency || "INR"} ${hourlyRate}`, unit: "Per hour" };
  }
}

function getNextAvailability(counsellor: Counsellor) {
  if (!counsellor.availability) {
    return counsellor.isAvailable ? "Today at 7:30 PM" : "On request";
  }

  const now = new Date();
  const today = now.getDay();

  for (let offset = 0; offset < DAY_ORDER.length; offset += 1) {
    const key = DAY_ORDER[(today + offset) % DAY_ORDER.length];
    const slot = counsellor.availability[key];

    if (slot?.isAvailable && slot.start) {
      const dayLabel = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : toTitleCase(key);
      return `${dayLabel} at ${formatAvailabilityTime(slot.start)}`;
    }
  }

  return "On request";
}

function formatAvailabilityTime(value: string) {
  const [rawHours, rawMinutes = "0"] = value.split(":");
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return value;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function getProfileInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return initials || "M";
}

function hasAnyKeyword(source: string, keywords: string[]) {
  return keywords.some((keyword) => source.includes(keyword));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
