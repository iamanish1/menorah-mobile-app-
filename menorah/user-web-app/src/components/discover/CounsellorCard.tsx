'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { Counsellor } from '@/types';

const WAVEFORM_BARS = [14, 24, 32, 18, 28, 38, 22, 34, 26, 42, 30, 20, 36, 44, 24, 34, 28, 40, 22, 32, 38, 26, 30, 18];
const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface CounsellorCardProps {
  c: Counsellor;
  index?: number;
}

export function CounsellorCard({ c, index = 0 }: CounsellorCardProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const tags = getSpecializationTags(c);
  const availability = getNextAvailability(c);
  const therapyHours = getTherapyHours(c);
  const primaryLanguage = c.languages[0] ?? 'English';
  const price = c.hourlyRate > 0 ? formatCurrency(c.hourlyRate, c.currency) : 'Free';
  const hasVoiceIntro = Boolean(c.voiceIntroUrl);

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
    <article
      className="counsellor-profile-card group"
      style={{ animationDelay: `${Math.min(index, 8) * 70}ms`, animationFillMode: 'both' }}
    >
      <div className="counsellor-profile-card__hero directory-wave-header">
        <div className="relative z-10 max-w-[68%]">
          <h3 className="truncate text-lg font-semibold leading-tight text-white">{c.name}</h3>
          <p className="mt-1 truncate text-xs font-medium text-white/85">{c.specialization}</p>
        </div>

        <div className="counsellor-profile-card__avatar" aria-hidden="true">
          {c.profileImage ? (
            <img src={c.profileImage} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            getInitial(c.name)
          )}
        </div>
      </div>

      <div className="counsellor-profile-card__body">
        <div className="flex gap-2 overflow-hidden border-b border-[#e3e7e0] pb-4">
          {tags.map((tag) => (
            <span key={tag} className="counsellor-profile-card__tag">
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3 border-b border-[#e3e7e0] pb-4">
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1f2933] text-white shadow-sm transition-transform duration-200 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 group-hover:scale-105"
            onClick={toggleVoiceIntro}
            disabled={!hasVoiceIntro}
            aria-label={hasVoiceIntro ? `${isPlaying ? 'Pause' : 'Play'} ${c.name} voice intro` : `${c.name} has no voice intro`}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-current" aria-hidden="true" />
            ) : (
              <Play className="h-5 w-5 fill-current" aria-hidden="true" />
            )}
          </button>
          {hasVoiceIntro && (
            <audio ref={audioRef} src={c.voiceIntroUrl} preload="none" onEnded={() => setIsPlaying(false)} />
          )}

          <div className="counsellor-profile-card__waveform" aria-hidden="true">
            {WAVEFORM_BARS.map((height, barIndex) => (
              <span key={`${height}-${barIndex}`} style={{ height, animationDelay: `${barIndex * 45}ms` }} />
            ))}
          </div>

          <Link href={`/counsellor/${c.id}`} className="counsellor-profile-card__outline-button">
            View Profile
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1.5">
          <StatTile value={therapyHours} label="Therapy hrs" />
          <StatTile value={primaryLanguage} label="Languages" />
          <StatTile value={price} label={c.hourlyRate > 0 ? 'Per hour' : 'Per session'} />
        </div>

        <div className="mt-4 flex items-end justify-between gap-4 border-t border-[#e3e7e0] pt-4">
          <div className="min-w-0">
            <p className="counsellor-profile-card__availability-label">Next available in</p>
            <p className="counsellor-profile-card__availability-value">{availability}</p>
          </div>
          <Link href={`/bookings/new?counsellorId=${c.id}`} className="counsellor-profile-card__book-button">
            Book Now
          </Link>
        </div>
      </div>
    </article>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="counsellor-profile-card__stat">
      <p className="counsellor-profile-card__stat-value">{value}</p>
      <p className="counsellor-profile-card__stat-label">{label}</p>
    </div>
  );
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'M';
}

function getSpecializationTags(c: Counsellor) {
  const tags = (c.specializations?.length ? c.specializations : c.specialization.split(/[,/|]+/))
    .map((tag) => tag.trim())
    .filter(Boolean);

  return (tags.length ? tags : ['Mental wellness']).slice(0, 3);
}

function getTherapyHours(c: Counsellor) {
  const source = c.totalSessions ?? c.experience * 120;
  const rounded = Math.max(50, Math.round(source / 10) * 10);
  return `${rounded}+`;
}

function getNextAvailability(c: Counsellor) {
  if (!c.availability) {
    return c.isAvailable ? 'Today at 7:30 PM' : 'On request';
  }

  const now = new Date();
  const today = now.getDay();

  for (let offset = 0; offset < DAY_ORDER.length; offset += 1) {
    const key = DAY_ORDER[(today + offset) % DAY_ORDER.length];
    const slot = c.availability[key];

    if (slot?.isAvailable && slot.start) {
      const dayLabel = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : toTitleCase(key);
      return `${dayLabel} at ${formatAvailabilityTime(slot.start)}`;
    }
  }

  return 'On request';
}

function formatAvailabilityTime(value: string) {
  const [rawHours, rawMinutes = '0'] = value.split(':');
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return value;
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
