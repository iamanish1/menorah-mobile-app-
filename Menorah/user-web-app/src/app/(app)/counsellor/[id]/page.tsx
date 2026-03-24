'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Star, Clock, Globe, Video, MessageCircle, Headphones,
  GraduationCap, Award, ArrowLeft, CalendarDays, CheckCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, Badge, Button, Spinner } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

export default function CounsellorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['counsellor', id],
    queryFn:  () => api.getCounsellor(id),
  });

  const c = data?.data?.counsellor;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!c) {
    return (
      <div className="page-container text-center py-20 text-gray-500">
        Counsellor not found.
      </div>
    );
  }

  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

  return (
    <div className="page-container max-w-4xl">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to results
      </button>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Hero card */}
          <div className="card p-6">
            <div className="flex gap-5">
              <Avatar src={c.profileImage} name={c.name} size="xl" online={c.isAvailable} className="shrink-0" />
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">{c.name}</h1>
                    <p className="text-primary-600 font-medium mt-0.5">{c.specialization}</p>
                  </div>
                  {c.isVerified && <Badge variant="primary">Verified</Badge>}
                </div>

                <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    <strong className="text-gray-700">{c.rating.toFixed(1)}</strong> ({c.reviewCount} reviews)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" /> {c.experience} years experience
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-4 h-4" /> {c.languages?.join(', ')}
                  </span>
                </div>

                {c.specializations && c.specializations.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {c.specializations.map((s) => (
                      <Badge key={s} variant="primary" size="sm">{s}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {c.bio && (
              <p className="text-gray-600 mt-4 leading-relaxed">{c.bio}</p>
            )}
          </div>

          {/* Education */}
          {c.education && c.education.length > 0 && (
            <div className="card p-6">
              <h2 className="section-title flex items-center gap-2 mb-4">
                <GraduationCap className="w-5 h-5 text-primary-500" /> Education
              </h2>
              <div className="space-y-3">
                {c.education.map((e, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-900">{e.degree}</p>
                      <p className="text-sm text-gray-500">{e.institution} • {e.year}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Certifications */}
          {c.certifications && c.certifications.length > 0 && (
            <div className="card p-6">
              <h2 className="section-title flex items-center gap-2 mb-4">
                <Award className="w-5 h-5 text-primary-500" /> Certifications
              </h2>
              <div className="space-y-2">
                {c.certifications.map((cert, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-primary-500 shrink-0" />
                    <span className="text-gray-700">{cert.name}</span>
                    <span className="text-gray-400 text-sm">– {cert.issuingBody}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Availability */}
          {c.availability && (
            <div className="card p-6">
              <h2 className="section-title flex items-center gap-2 mb-4">
                <CalendarDays className="w-5 h-5 text-primary-500" /> Weekly Availability
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {days.map((day) => {
                  const slot = c.availability?.[day];
                  return (
                    <div key={day} className={`rounded-xl p-3 text-sm ${slot?.isAvailable ? 'bg-primary-50 border border-primary-100' : 'bg-gray-50 border border-gray-100'}`}>
                      <p className="font-medium text-gray-700 capitalize">{day.slice(0,3)}</p>
                      {slot?.isAvailable ? (
                        <p className="text-primary-600 text-xs mt-0.5">{slot.start} – {slot.end}</p>
                      ) : (
                        <p className="text-gray-400 text-xs mt-0.5">Unavailable</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sticky booking card */}
        <div className="lg:col-span-1">
          <div className="card p-5 sticky top-6 space-y-4">
            <div className="text-center">
              <span className="text-3xl font-bold text-gray-900">{formatCurrency(c.hourlyRate, c.currency)}</span>
              <span className="text-gray-500 text-sm ml-1">/ hour</span>
            </div>

            <div className="space-y-2 text-sm">
              <p className="font-medium text-gray-700">Session types available:</p>
              <div className="flex gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 rounded-lg text-primary-700">
                  <Video className="w-3.5 h-3.5" /> Video
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 rounded-lg text-primary-700">
                  <MessageCircle className="w-3.5 h-3.5" /> Chat
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 rounded-lg text-primary-700">
                  <Headphones className="w-3.5 h-3.5" /> Audio
                </span>
              </div>
            </div>

            {c.sessionDuration && (
              <p className="text-sm text-gray-500">
                Default session: <strong className="text-gray-700">{c.sessionDuration} minutes</strong>
              </p>
            )}

            <Button
              fullWidth size="lg"
              onClick={() => router.push(`/bookings/new?counsellorId=${c.id}`)}
            >
              Book a Session
            </Button>

            <Button
              variant="secondary" fullWidth
              onClick={() => router.push(`/chat?counsellorId=${c.userId || c.id}`)}
            >
              <MessageCircle className="w-4 h-4" />
              Send a Message
            </Button>

            {c.totalSessions !== undefined && (
              <p className="text-center text-xs text-gray-400">
                {c.totalSessions} sessions completed
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
