'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ElementType, ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Award,
  BarChart2,
  Calendar,
  CheckCircle,
  GraduationCap,
  IndianRupee,
  Key,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Star,
  Unlock,
  UserRound,
  XCircle
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import type {
  Counsellor,
  CounsellorAvailability,
  CounsellorCertification,
  CounsellorEducation
} from '@/types';
import toast from 'react-hot-toast';

interface BookingStats {
  overall: { total: number; confirmed: number; cancelled: number; completed: number; acceptRate: number; cancelRate: number };
  dailyStats: { date: string; total: number; confirmed: number; cancelled: number; completed: number }[];
}

interface FieldProps {
  label: string;
  value?: string | number | null;
}

const EMPTY_BOOKING_TOTALS = {
  today: { total: 0, completed: 0, cancelled: 0 },
  thisMonth: { total: 0, revenue: 0 }
};

const WEEKDAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday'
};

const DEFAULT_BOOKING_STATS: BookingStats = {
  overall: { total: 0, confirmed: 0, cancelled: 0, completed: 0, acceptRate: 0, cancelRate: 0 },
  dailyStats: []
};

function DetailField({ label, value }: FieldProps) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900 break-words">{value || 'Not provided'}</p>
    </div>
  );
}

function TagList({ tags }: { tags?: string[] }) {
  if (!tags?.length) {
    return <p className="text-sm text-gray-400">No tags added.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span key={tag} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700">
          {tag}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-400">
      {children}
    </div>
  );
}

function EducationList({ education }: { education?: CounsellorEducation[] }) {
  if (!education?.length) return <EmptyState>No education records added.</EmptyState>;

  return (
    <div className="space-y-3">
      {education.map((item, index) => (
        <div key={`${item.degree || 'education'}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">{item.degree || 'Education record'}</p>
          <p className="mt-1 text-sm text-gray-600">{item.institution || 'Institution not provided'}{item.year ? `, ${item.year}` : ''}</p>
          {item.description && <p className="mt-2 text-sm leading-6 text-gray-500">{item.description}</p>}
        </div>
      ))}
    </div>
  );
}

function CertificationList({ certifications }: { certifications?: CounsellorCertification[] }) {
  if (!certifications?.length) return <EmptyState>No certifications added.</EmptyState>;

  return (
    <div className="space-y-3">
      {certifications.map((item, index) => (
        <div key={`${item.name || 'certification'}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">{item.name || 'Certification'}</p>
          <p className="mt-1 text-sm text-gray-600">{item.issuingBody || 'Issuing body not provided'}{item.year ? `, ${item.year}` : ''}</p>
          {item.expiryDate && <p className="mt-2 text-xs font-medium text-gray-400">Expires {formatDate(item.expiryDate)}</p>}
        </div>
      ))}
    </div>
  );
}

function AvailabilityGrid({ availability }: { availability?: CounsellorAvailability }) {
  const entries = Object.entries(WEEKDAY_LABELS).map(([key, label]) => ({
    key,
    label,
    day: availability?.[key]
  }));

  if (!availability || Object.keys(availability).length === 0) {
    return <EmptyState>No availability schedule added.</EmptyState>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(({ key, label, day }) => (
        <div key={key} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-900">{label}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${day?.isAvailable ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
              {day?.isAvailable ? 'Available' : 'Off'}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            {day?.isAvailable ? `${day.start || 'Start'} - ${day.end || 'End'}` : 'Not accepting sessions'}
          </p>
        </div>
      ))}
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: ElementType; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Icon size={16} />
        </div>
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export default function CounsellorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [counsellor, setCounsellor] = useState<Counsellor | null>(null);
  const [allStats, setAllStats] = useState<Record<string, unknown> | null>(null);
  const [bookingStats, setBookingStats] = useState<BookingStats>(DEFAULT_BOOKING_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  const [rejectModal, setRejectModal] = useState(false);
  const [blockModal, setBlockModal] = useState(false);
  const [credModal, setCredModal] = useState<{
    open: boolean;
    username: string;
    password?: string;
    emailSent?: boolean;
    emailRecipient?: string;
  }>({ open: false, username: '', password: '' });
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    const detailRes = await api.getCounsellor(id);
    if (!detailRes.success || !detailRes.data) {
      setCounsellor(null);
      setAllStats(null);
      setBookingStats(DEFAULT_BOOKING_STATS);
      setError(detailRes.message || 'Unable to load counselor details');
      setLoading(false);
      return;
    }

    const nextCounsellor = detailRes.data.counsellor as Counsellor;
    setCounsellor(nextCounsellor);
    setAllStats(detailRes.data.bookingStats as Record<string, unknown>);

    if (nextCounsellor.isPendingApplication) {
      setBookingStats(DEFAULT_BOOKING_STATS);
      setLoading(false);
      return;
    }

    const statsRes = await api.getCounsellorBookingStats(id, 14);
    setBookingStats(statsRes.success && statsRes.data ? statsRes.data as BookingStats : DEFAULT_BOOKING_STATS);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const displayName = useMemo(() => {
    if (!counsellor) return '';
    return `${counsellor.user?.firstName || ''} ${counsellor.user?.lastName || ''}`.trim();
  }, [counsellor]);

  const handleApprove = async () => {
    if (!counsellor) return;
    setActionLoading('approve');
    const res = await api.approveCounsellor(counsellor.id || counsellor._id!);
    setActionLoading('');
    if (res.success && res.data) {
      toast.success('Counsellor approved');
      setCredModal({
        open: true,
        username: res.data.username,
        password: '',
        emailSent: res.data.credentialEmailSent,
        emailRecipient: res.data.credentialEmailRecipient
      });
      await load();
    } else {
      toast.error(res.message || 'Failed to approve');
    }
  };

  const handleReject = async () => {
    if (!reason.trim() || !counsellor) { toast.error('Reason required'); return; }
    setActionLoading('reject');
    const res = await api.rejectCounsellor(counsellor.id || counsellor._id!, reason);
    setActionLoading('');
    if (res.success) {
      toast.success('Rejected');
      setRejectModal(false);
      setReason('');
      await load();
    } else {
      toast.error(res.message || 'Failed');
    }
  };

  const handleGeneratePassword = async () => {
    if (!counsellor) return;
    setActionLoading('creds');
    const res = await api.generatePassword(counsellor.id || counsellor._id!);
    setActionLoading('');
    if (res.success && res.data) {
      setCredModal({ open: true, username: res.data.username, password: res.data.password });
      await load();
    } else {
      toast.error(res.message || 'Failed');
    }
  };

  const handleBlockToggle = async () => {
    if (!counsellor) return;
    if (counsellor.isActive && !reason.trim()) { toast.error('Reason required'); return; }
    setActionLoading('block');
    const cId = counsellor.id || counsellor._id!;
    const res = counsellor.isActive ? await api.blockCounsellor(cId, reason) : await api.unblockCounsellor(cId);
    setActionLoading('');
    if (res.success) {
      toast.success(counsellor.isActive ? 'Counsellor blocked' : 'Counsellor unblocked');
      setBlockModal(false);
      setReason('');
      await load();
    } else {
      toast.error(res.message || 'Failed');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 animate-pulse rounded bg-gray-100" />
        <div className="h-48 animate-pulse rounded-xl border border-gray-200 bg-white" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
        </div>
      </div>
    );
  }

  if (error || !counsellor) {
    return (
      <div className="max-w-3xl space-y-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900">
          <ArrowLeft size={16} /> Back to Counsellors
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error || 'Unable to load counselor details.'}
        </div>
      </div>
    );
  }

  const isApplication = Boolean(counsellor.isPendingApplication);
  const isBlocked = counsellor.status === 'approved' && !counsellor.isActive;
  const todayStats = (allStats?.today as { total: number; completed: number; cancelled: number }) || EMPTY_BOOKING_TOTALS.today;
  const monthStats = (allStats?.thisMonth as { total: number; revenue: number }) || EMPTY_BOOKING_TOTALS.thisMonth;
  const badgeVariant = isBlocked ? 'blocked' : counsellor.status as 'pending' | 'approved' | 'rejected';

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900">
          <ArrowLeft size={16} /> Back to Counsellors
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {counsellor.status === 'pending' && (
            <>
              <button onClick={handleApprove} disabled={!!actionLoading} className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-60">
                <CheckCircle size={15} /> {actionLoading === 'approve' ? 'Approving...' : 'Approve'}
              </button>
              <button onClick={() => { setRejectModal(true); setReason(''); }} className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100">
                <span className="flex items-center gap-1.5"><XCircle size={15} /> Reject</span>
              </button>
            </>
          )}
          {counsellor.status === 'approved' && !isBlocked && (
            <>
              <button onClick={handleGeneratePassword} disabled={!!actionLoading} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60">
                <Key size={15} /> {actionLoading === 'creds' ? 'Generating...' : 'Generate Password'}
              </button>
              <button onClick={() => { setBlockModal(true); setReason(''); }} className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200">
                <Lock size={15} /> Block
              </button>
            </>
          )}
          {isBlocked && (
            <button onClick={() => { setBlockModal(true); setReason(''); }} className="flex items-center gap-1.5 rounded-xl bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100">
              <Unlock size={15} /> Unblock
            </button>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-xl font-bold text-blue-700">
            {getInitials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">{displayName || 'Unnamed applicant'}</h2>
              <Badge variant={badgeVariant}>{isBlocked ? 'blocked' : counsellor.status}</Badge>
              {isApplication && <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">Application profile</span>}
            </div>
            <div className="mt-3 grid gap-3 text-sm text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
              <span className="flex items-center gap-2"><Mail size={14} className="text-gray-400" /> {counsellor.user.email}</span>
              <span className="flex items-center gap-2"><Phone size={14} className="text-gray-400" /> {counsellor.user.phone || 'No phone'}</span>
              <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-gray-400" /> License {counsellor.licenseNumber || 'missing'}</span>
              <span className="flex items-center gap-2"><Calendar size={14} className="text-gray-400" /> Applied {formatDate(counsellor.createdAt)}</span>
            </div>
            <p className="mt-4 max-w-4xl text-sm leading-6 text-gray-600">{counsellor.bio || 'No bio provided.'}</p>
          </div>
        </div>

        {counsellor.rejectionReason && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <strong>Rejection reason:</strong> {counsellor.rejectionReason}
          </div>
        )}
        {counsellor.approvedAt && (
          <div className="mt-5 border-t border-gray-100 pt-4 text-xs text-gray-500">
            Approved by {counsellor.approvedBy?.firstName} {counsellor.approvedBy?.lastName} on {formatDate(counsellor.approvedAt)}
          </div>
        )}
        {counsellor.reviewedAt && counsellor.status === 'rejected' && (
          <div className="mt-5 border-t border-gray-100 pt-4 text-xs text-gray-500">
            Reviewed by {counsellor.reviewedBy?.firstName} {counsellor.reviewedBy?.lastName} on {formatDate(counsellor.reviewedAt)}
          </div>
        )}
        {isBlocked && counsellor.blockedReason && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>Blocked:</strong> {counsellor.blockedReason} {counsellor.blockedAt ? `- ${formatDate(counsellor.blockedAt)}` : ''}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Specialization</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{counsellor.specialization || 'Not provided'}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Experience</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{counsellor.experience ?? 0} years</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Hourly rate</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{formatCurrency(counsellor.hourlyRate || 0)}/hr</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Languages</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{counsellor.languages?.join(', ') || 'Not provided'}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Applicant Details" icon={UserRound}>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Email" value={counsellor.user.email} />
            <DetailField label="Phone" value={counsellor.user.phone} />
            <DetailField label="Date of birth" value={counsellor.dateOfBirth ? formatDate(counsellor.dateOfBirth) : null} />
            <DetailField label="Gender" value={counsellor.gender} />
            <DetailField label="License number" value={counsellor.licenseNumber} />
            <DetailField label="Currency" value={counsellor.currency || 'INR'} />
          </div>
        </SectionCard>

        <SectionCard title="Specializations" icon={Award}>
          <TagList tags={counsellor.specializations?.length ? counsellor.specializations : counsellor.specialization ? [counsellor.specialization] : []} />
          <div className="mt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Languages</p>
            <TagList tags={counsellor.languages} />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Education" icon={GraduationCap}>
          <EducationList education={counsellor.education} />
        </SectionCard>

        <SectionCard title="Certifications" icon={ShieldCheck}>
          <CertificationList certifications={counsellor.certifications} />
        </SectionCard>
      </div>

      <SectionCard title="Availability" icon={Calendar}>
        <AvailabilityGrid availability={counsellor.availability} />
      </SectionCard>

      {counsellor.status === 'approved' && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: 'Today Sessions', value: todayStats.total, icon: Calendar, color: 'text-blue-600 bg-blue-50' },
              { label: 'Month Sessions', value: monthStats.total, icon: BarChart2, color: 'text-purple-600 bg-purple-50' },
              { label: 'Accept Rate', value: `${bookingStats.overall.acceptRate || 0}%`, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
              { label: 'Month Revenue', value: formatCurrency(monthStats.revenue || 0), icon: IndianRupee, color: 'text-amber-600 bg-amber-50' }
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${stat.color}`}>
                  <stat.icon size={16} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                  <p className="text-lg font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-900">Booking Activity (Last 14 Days)</h3>
              <span className="flex items-center gap-1 text-sm font-medium text-amber-600">
                <Star size={14} fill="currentColor" /> {counsellor.rating?.toFixed(1) || '0.0'} ({counsellor.reviewCount || 0} reviews)
              </span>
            </div>
            {bookingStats.dailyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={bookingStats.dailyStats} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={(date) => date.slice(5)} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="confirmed" name="Confirmed" fill="#22c55e" radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="completed" name="Completed" fill="#2563eb" radius={[3, 3, 0, 0]} stackId="b" />
                  <Bar dataKey="cancelled" name="Cancelled" fill="#ef4444" radius={[3, 3, 0, 0]} stackId="c" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState>No booking activity yet.</EmptyState>
            )}
          </div>
        </>
      )}

      {counsellor.bankDetails?.configured && (
        <SectionCard title="Bank Details" icon={IndianRupee}>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Account holder" value={counsellor.bankDetails.accountHolderName} />
            <DetailField label="Bank name" value={counsellor.bankDetails.bankName} />
            <DetailField label="Account number" value={counsellor.bankDetails.accountNumberMasked} />
            <DetailField label="IFSC code" value={counsellor.bankDetails.ifscCode} />
          </div>
        </SectionCard>
      )}

      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Reject Application" size="sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Rejection Reason</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Explain why this application is being rejected..."
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setRejectModal(false)} className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleReject} disabled={!!actionLoading} className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {actionLoading === 'reject' ? 'Rejecting...' : 'Confirm Reject'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={blockModal} onClose={() => setBlockModal(false)} title={isBlocked ? 'Unblock Counsellor' : 'Block Counsellor'} size="sm">
        <div className="space-y-4">
          {isBlocked ? (
            <p className="text-sm text-gray-600">Are you sure you want to unblock this counsellor? They can receive bookings and log in again.</p>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Block Reason</label>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                placeholder="Reason for blocking..."
              />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setBlockModal(false)} className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleBlockToggle} disabled={!!actionLoading} className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${isBlocked ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-800'}`}>
              {actionLoading === 'block' ? '...' : isBlocked ? 'Unblock' : 'Block'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={credModal.open} onClose={() => setCredModal({ open: false, username: '', password: '' })} title="Credentials Generated" size="sm">
        <div className="space-y-4">
          <div className={`rounded-xl border px-4 py-3 text-sm ${credModal.emailSent === true ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            {credModal.emailSent === true
              ? `Credentials were emailed to ${credModal.emailRecipient || credModal.username}.`
              : credModal.emailSent === false
                ? 'Credentials were generated, but the email was not sent. Generate a password reset before sharing access.'
                : 'Share these with the counsellor. Password shown only once.'}
          </div>
          {[
            { label: 'Username', value: credModal.username },
            ...(credModal.password ? [{ label: 'Password', value: credModal.password }] : [])
          ].map(({ label, value }) => (
            <div key={label}>
              <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <code className="break-all font-mono text-sm text-gray-800">{value}</code>
              </div>
            </div>
          ))}
          <button onClick={() => setCredModal({ open: false, username: '', password: '' })} className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Done</button>
        </div>
      </Modal>
    </div>
  );
}
