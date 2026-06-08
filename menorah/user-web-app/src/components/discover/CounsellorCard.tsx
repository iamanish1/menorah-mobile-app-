import Link from 'next/link';
import { Play } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { Counsellor } from '@/types';

const WAVEFORM_BARS = [18, 28, 15, 31, 22, 36, 18, 33, 26, 39, 20, 35, 29, 41, 23, 34, 17, 31, 25, 38, 19, 30, 24, 34];
const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface CounsellorCardProps {
  c: Counsellor;
  index?: number;
}

export function CounsellorCard({ c, index = 0 }: CounsellorCardProps) {
  const tags = getSpecializationTags(c);
  const availability = getNextAvailability(c);
  const therapyHours = getTherapyHours(c);
  const primaryLanguage = c.languages[0] ?? 'English';
  const price = c.hourlyRate > 0 ? formatCurrency(c.hourlyRate, c.currency) : 'Free';

  return (
    <article
      className="counsellor-profile-card group"
      style={{ animationDelay: `${Math.min(index, 8) * 70}ms`, animationFillMode: 'both' }}
    >
      <div className="counsellor-profile-card__hero directory-wave-header">
        <div className="relative z-10 min-w-0">
          <h3 className="truncate font-body text-lg font-bold leading-tight text-white">{c.name}</h3>
          <p className="mt-0.5 truncate text-xs font-semibold text-primary-950/85">{c.specialization}</p>
        </div>

        <div className="counsellor-profile-card__avatar" aria-hidden="true">
          {getInitial(c.name)}
        </div>
      </div>

      <div className="counsellor-profile-card__body">
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="counsellor-profile-card__tag">
              {tag}
            </span>
          ))}
        </div>

        <div className="counsellor-profile-card__rule" />

        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
            <Play className="h-4 w-4 fill-current" aria-hidden="true" />
          </span>

          <div className="counsellor-profile-card__waveform" aria-hidden="true">
            {WAVEFORM_BARS.map((height, barIndex) => (
              <span key={`${height}-${barIndex}`} style={{ height, animationDelay: `${barIndex * 45}ms` }} />
            ))}
          </div>

          <Link href={`/counsellor/${c.id}`} className="counsellor-profile-card__outline-button">
            View Profile
          </Link>
        </div>

        <div className="counsellor-profile-card__rule" />

        <div className="grid grid-cols-3 gap-1.5">
          <StatTile value={therapyHours} label="Therapy hrs" />
          <StatTile value={primaryLanguage} label="Languages" />
          <StatTile value={price} label={c.hourlyRate > 0 ? 'Per hour' : 'Per session'} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-primary-100 pt-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-400">Next available in</p>
            <p className="mt-0.5 truncate text-sm font-bold text-slate-950">{availability}</p>
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
    <div className="rounded-lg bg-slate-50 px-2.5 py-3">
      <p className="truncate text-sm font-black leading-tight text-slate-950">{value}</p>
      <p className="mt-1 truncate text-[10px] font-medium text-slate-600">{label}</p>
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
