"use client";

import { useMemo, useState } from "react";
import { BookOpen, HeartPulse, MessageCircle, Play, Search, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type DirectoryProfile = {
  id: string;
  name: string;
  role: "Consultant Psychologist" | "Clinical Psychologist" | "Sexual Health" | "Psychiatrist";
  specialties: string[];
  language: string;
  hours: string;
  feeLabel: string;
  availability: string;
  initials: string;
};

const profiles: DirectoryProfile[] = [
  {
    id: "ramu",
    name: "Ramu",
    role: "Consultant Psychologist",
    specialties: ["Work stress", "Self-esteem", "Anxiety support"],
    language: "English",
    hours: "250+",
    feeLabel: "Free",
    availability: "Today at 7:30 PM",
    initials: "R"
  },
  {
    id: "damu",
    name: "Damu",
    role: "Clinical Psychologist",
    specialties: ["Mood concerns", "Trauma support", "Life transitions"],
    language: "Malayalam",
    hours: "420+",
    feeLabel: "Free",
    availability: "Tomorrow at 9:00 AM",
    initials: "D"
  },
  {
    id: "shamu",
    name: "Shamu",
    role: "Consultant Psychologist",
    specialties: ["Relationships", "Personal growth", "Men's wellness"],
    language: "Hindi",
    hours: "310+",
    feeLabel: "Free",
    availability: "Tomorrow at 11:30 AM",
    initials: "S"
  },
  {
    id: "liju",
    name: "Liju",
    role: "Psychiatrist",
    specialties: ["Sleep support", "Stress care", "Medication guidance"],
    language: "Malayalam",
    hours: "600+",
    feeLabel: "Free",
    availability: "Tomorrow at 1:00 PM",
    initials: "L"
  },
  {
    id: "fatima",
    name: "Fatima",
    role: "Sexual Health",
    specialties: ["Identity support", "Confidence", "Private guidance"],
    language: "English",
    hours: "500+",
    feeLabel: "Free",
    availability: "Tomorrow at 2:30 PM",
    initials: "F"
  },
  {
    id: "khadija",
    name: "Khadija",
    role: "Clinical Psychologist",
    specialties: ["Depression support", "Burnout", "Family stress"],
    language: "Arabic",
    hours: "700+",
    feeLabel: "Free",
    availability: "Tomorrow at 4:00 PM",
    initials: "K"
  },
  {
    id: "alex",
    name: "Alex",
    role: "Consultant Psychologist",
    specialties: ["Career pressure", "Peer support", "Mindfulness"],
    language: "English",
    hours: "340+",
    feeLabel: "Free",
    availability: "Friday at 10:00 AM",
    initials: "A"
  },
  {
    id: "thomas",
    name: "Thomas",
    role: "Psychiatrist",
    specialties: ["Attention support", "Mood care", "Sleep routines"],
    language: "English",
    hours: "860+",
    feeLabel: "Free",
    availability: "Friday at 12:30 PM",
    initials: "T"
  },
  {
    id: "vijay",
    name: "Vijay",
    role: "Consultant Psychologist",
    specialties: ["Academic pressure", "Self-worth", "Social anxiety"],
    language: "Hindi",
    hours: "280+",
    feeLabel: "Free",
    availability: "Friday at 5:30 PM",
    initials: "V"
  },
  {
    id: "lakshya",
    name: "Lakshya",
    role: "Clinical Psychologist",
    specialties: ["Habits", "Anger support", "Confidence"],
    language: "English",
    hours: "390+",
    feeLabel: "Free",
    availability: "Saturday at 8:30 AM",
    initials: "L"
  },
  {
    id: "virat",
    name: "Virat",
    role: "Consultant Psychologist",
    specialties: ["Performance stress", "Leadership", "Resilience"],
    language: "Hindi",
    hours: "540+",
    feeLabel: "Free",
    availability: "Saturday at 1:30 PM",
    initials: "V"
  },
  {
    id: "sanjana",
    name: "Sanjana",
    role: "Sexual Health",
    specialties: ["Confidential support", "Body image", "Boundaries"],
    language: "English",
    hours: "470+",
    feeLabel: "Free",
    availability: "Saturday at 6:00 PM",
    initials: "S"
  },
  {
    id: "irene",
    name: "Irene",
    role: "Clinical Psychologist",
    specialties: ["Grief support", "Emotional regulation", "Connection"],
    language: "English",
    hours: "760+",
    feeLabel: "Free",
    availability: "Sunday at 9:30 AM",
    initials: "I"
  }
];

const filterOptions = [
  { label: "All support", value: "All", icon: Users },
  { label: "Consultant Psychologist", value: "Consultant Psychologist", icon: MessageCircle },
  { label: "Clinical Psychologist", value: "Clinical Psychologist", icon: ShieldCheck },
  { label: "Sexual Health", value: "Sexual Health", icon: HeartPulse },
  { label: "Psychiatrist", value: "Psychiatrist", icon: BookOpen }
] as const;

const waveformBars = [14, 24, 32, 18, 28, 38, 22, 34, 26, 42, 30, 20, 36, 44, 24, 34, 28, 40, 22, 32, 38, 26, 30, 18];
const INITIAL_PROFILE_COUNT = 6;
const LOAD_MORE_COUNT = 3;

export function SupportDirectoryPreviewSection() {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<(typeof filterOptions)[number]["value"]>("All");
  const [visibleCount, setVisibleCount] = useState(INITIAL_PROFILE_COUNT);

  const visibleProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return profiles.filter((profile) => {
      const matchesFilter = activeFilter === "All" || profile.role === activeFilter;
      const searchableText = [profile.name, profile.role, profile.language, ...profile.specialties].join(" ").toLowerCase();
      return matchesFilter && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [activeFilter, query]);
  const displayedProfiles = visibleProfiles.slice(0, visibleCount);
  const remainingProfiles = Math.max(visibleProfiles.length - displayedProfiles.length, 0);

  return (
    <section
      id="support-directory"
      aria-labelledby="support-directory-title"
      className="relative min-h-screen overflow-hidden bg-[#fbfbfa] px-4 py-14 text-[#0f172a] sm:px-6 lg:px-10"
    >
      <h2 id="support-directory-title" className="sr-only">
        Menorah support directory preview
      </h2>

      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-2 rounded-2xl border border-[#dde1da] bg-[#fff] p-2 shadow-[0_18px_60px_rgba(35,45,36,0.08)] lg:flex-row lg:items-center">
          <label className="relative min-w-0 lg:w-[340px] lg:flex-none" htmlFor="support-directory-search">
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
              className="h-11 w-full rounded-xl border border-[#d9ddd6] bg-[#fff] pl-12 pr-4 text-sm font-medium text-[#0f172a] outline-none transition placeholder:text-[#a2a9ad] focus:border-menorah-green/45 focus:ring-4 focus:ring-menorah-green/10"
            />
          </label>

          <div className="flex gap-2 overflow-x-auto pb-1 lg:overflow-visible lg:pb-0" aria-label="Directory filters">
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
                    "flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-menorah-green/12",
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

        <div id="support-directory-results" className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {displayedProfiles.map((profile) => (
            <DirectoryCard key={profile.id} profile={profile} />
          ))}
        </div>

        {visibleProfiles.length > 0 ? (
          <div className="mt-9 flex justify-center">
            {remainingProfiles > 0 ? (
              <button
                type="button"
                aria-controls="support-directory-results"
                aria-label="Load more consultants"
                onClick={() => setVisibleCount((count) => count + LOAD_MORE_COUNT)}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-menorah-green px-8 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(46,72,46,0.18)] transition hover:scale-[1.02] hover:bg-menorah-olive focus:outline-none focus:ring-4 focus:ring-menorah-green/15"
              >
                Load More
              </button>
            ) : null}
          </div>
        ) : null}

        {visibleProfiles.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-menorah-green/12 bg-[#fff] p-8 text-center text-sm font-medium text-[#4b5563]">
            No matching support profiles found.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DirectoryCard({ profile }: { profile: DirectoryProfile }) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-[#dfe3dd] bg-[#fff] shadow-[0_14px_45px_rgba(35,45,36,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(35,45,36,0.12)]">
      <div className="directory-wave-header relative h-28 overflow-hidden px-4 pt-5 sm:h-32">
        <div className="relative z-10 max-w-[68%]">
          <h3 className="text-lg font-semibold leading-tight text-white">{profile.name}</h3>
          <p className="mt-1 text-xs font-medium text-white/86">{profile.role}</p>
        </div>
        <div className="absolute bottom-4 right-4 z-10 flex h-20 w-20 items-center justify-center rounded-full border border-white/35 bg-[#ffffff]/25 text-2xl font-semibold text-menorah-green shadow-[0_14px_35px_rgba(0,0,0,0.12)] sm:h-24 sm:w-24">
          {profile.initials}
        </div>
      </div>

      <div className="-mt-4 rounded-t-[22px] bg-[#fff] px-4 pb-4 pt-5">
        <div className="flex gap-2 overflow-hidden border-b border-[#e3e7e0] pb-4">
          {profile.specialties.map((specialty) => (
            <span
              key={specialty}
              className="shrink-0 rounded-lg border border-[#d9ddd6] bg-[#fff] px-3 py-2 text-[11px] font-medium text-[#0f172a] shadow-[0_4px_12px_rgba(15,23,42,0.04)]"
            >
              {specialty}
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3 border-b border-[#e3e7e0] pb-4">
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1f2933] text-white transition hover:scale-105"
            aria-label={`Play ${profile.name} voice intro`}
          >
            <Play className="h-5 w-5 fill-current" aria-hidden="true" />
          </button>
          <div className="flex h-12 min-w-0 flex-1 items-center gap-1 rounded-xl border border-[#d9ddd6] bg-[#fafafa] px-3">
            <Waveform />
          </div>
          <button
            type="button"
            className="h-11 shrink-0 rounded-full border border-[#0f172a] bg-[#fff] px-4 text-xs font-semibold text-[#0f172a] transition hover:bg-[#0f172a] hover:text-white"
          >
            View Profile
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1.5">
          <StatBlock label="Therapy hrs" value={profile.hours} />
          <StatBlock label="Languages" value={profile.language} />
          <StatBlock label="Per session" value={profile.feeLabel} />
        </div>

        <div className="mt-4 flex items-end justify-between gap-4 border-t border-[#e3e7e0] pt-4">
          <div className="min-w-0">
            <p className="text-xs text-[#a1a8ad]">Next available in</p>
            <p className="mt-1 truncate text-sm font-semibold text-[#0f172a]">{profile.availability}</p>
          </div>
          <button
            type="button"
            className="h-11 shrink-0 rounded-full bg-menorah-green px-7 text-xs font-semibold uppercase tracking-[0.08em] text-white transition hover:scale-[1.03] hover:bg-menorah-olive focus:outline-none focus:ring-4 focus:ring-menorah-green/15"
          >
            Book Now
          </button>
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
    <div className="min-w-0 rounded-xl bg-[#f7f7f6] px-3 py-3">
      <p className="truncate text-sm font-semibold text-[#0f172a]">{value}</p>
      <p className="mt-1 truncate text-[11px] text-[#334155]">{label}</p>
    </div>
  );
}
