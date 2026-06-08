import Link from 'next/link';
import { Star, Clock, Globe, Video, MessageCircle, Headphones, BadgeCheck } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import type { Counsellor } from '@/types';

export function CounsellorCard({ c }: { c: Counsellor }) {
  return (
    <Link href={`/counsellor/${c.id}`} className="block group">
      <div className={cn(
        'bg-white border border-primary-100 rounded-[1.4rem] p-5 shadow-[0_12px_32px_-26px_rgba(45,122,92,0.42)] dark:bg-primary-900 dark:border-primary-800',
        'hover:border-primary-200 hover:shadow-[0_16px_34px_-22px_rgba(45,122,92,0.35)] dark:hover:border-primary-600',
        'transition-all duration-200'
      )}>
        <div className="flex gap-4">
          <Avatar
            src={c.profileImage}
            name={c.name}
            size="lg"
            online={c.isAvailable}
            className="shrink-0"
          />

          <div className="flex-1 min-w-0">
            {/* Name + verified */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-gray-950 group-hover:text-primary-700 transition-colors leading-tight dark:text-primary-50 dark:group-hover:text-primary-200">
                  {c.name}
                </h3>
                <p className="text-[13px] text-primary-600 dark:text-primary-300 font-semibold mt-0.5">{c.specialization}</p>
              </div>
              {c.isVerified && (
                <BadgeCheck className="w-[18px] h-[18px] text-primary-500 shrink-0 mt-0.5" />
              )}
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-[13px] text-gray-500 dark:text-primary-100/65">
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span className="font-semibold text-gray-800 dark:text-primary-50">{c.rating.toFixed(1)}</span>
                <span className="text-gray-400 dark:text-primary-100/45">({c.reviewCount})</span>
              </span>
              <span className="text-gray-200 select-none">·</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                {c.experience}yr exp
              </span>
              <span className="text-gray-200 select-none">·</span>
              <span className="flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-gray-400" />
                {c.languages.slice(0, 2).join(', ')}
              </span>
            </div>

            {c.bio && (
              <p className="text-[13px] text-gray-400 dark:text-primary-100/55 mt-2 line-clamp-2 leading-relaxed">{c.bio}</p>
            )}

            {/* Session types + price */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-primary-50 dark:border-primary-800">
              <div className="flex items-center gap-1.5 text-gray-350">
                <Video className="w-3.5 h-3.5 text-gray-300" />
                <Headphones className="w-3.5 h-3.5 text-gray-300" />
                <MessageCircle className="w-3.5 h-3.5 text-gray-300" />
              </div>
              <span className="text-[15px] font-black text-gray-950 dark:text-primary-50">
                {formatCurrency(c.hourlyRate, c.currency)}
                <span className="text-xs font-normal text-gray-400 dark:text-primary-100/50 ml-0.5">/hr</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
