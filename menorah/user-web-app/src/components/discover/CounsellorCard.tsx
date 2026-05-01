import Link from 'next/link';
import { Star, Clock, Globe, Video, MessageCircle, Headphones } from 'lucide-react';
import { Avatar, Badge } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import type { Counsellor } from '@/types';

export function CounsellorCard({ c }: { c: Counsellor }) {
  return (
    <Link href={`/counsellor/${c.id}`} className="block">
      <div className="card p-5 hover:shadow-md transition-shadow duration-200 group">
        <div className="flex gap-4">
          <Avatar
            src={c.profileImage}
            name={c.name}
            size="lg"
            online={c.isAvailable}
            className="shrink-0"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors truncate">
                  {c.name}
                </h3>
                <p className="text-sm text-primary-600 font-medium mt-0.5">{c.specialization}</p>
              </div>
              {c.isVerified && (
                <Badge variant="primary" size="sm">Verified</Badge>
              )}
            </div>

            <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                <span className="font-medium text-gray-700">{c.rating.toFixed(1)}</span>
                <span>({c.reviewCount})</span>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {c.experience}y exp
              </span>
              <span className="flex items-center gap-1">
                <Globe className="w-3.5 h-3.5" />
                {c.languages.slice(0, 2).join(', ')}
              </span>
            </div>

            {c.bio && (
              <p className="text-sm text-gray-500 mt-2 line-clamp-2">{c.bio}</p>
            )}

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-gray-400" />
                <MessageCircle className="w-3.5 h-3.5 text-gray-400" />
                <Headphones className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <span className="text-base font-semibold text-gray-900">
                {formatCurrency(c.hourlyRate, c.currency)}
                <span className="text-xs font-normal text-gray-500">/hr</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
