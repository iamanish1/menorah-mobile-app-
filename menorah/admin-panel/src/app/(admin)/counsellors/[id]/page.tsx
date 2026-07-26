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
  FileCheck2,
  GraduationCap,
  IndianRupee,
  Key,
  Lock,
  Mail,
  Phone,
  Plus,
  RotateCcw,
  ShieldCheck,
  Star,
  Trash2,
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
import FreshAdminMfaModal from '@/components/auth/FreshAdminMfaModal';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, getInitials } from '@/lib/utils';
import type {
  Counsellor,
  CounsellorAdminActor,
  CounsellorAvailability,
  CounsellorCertification,
  CounsellorCredentialEvidenceInput,
  CounsellorEducation,
  CounsellorVerificationStatus
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

interface EvidenceDraft {
  reference: string;
  category: string;
  sha256: string;
  contentType: string;
  sizeBytes: string;
}

type BadgeVariant = 'pending' | 'approved' | 'rejected' | 'blocked' | 'default';

const EMPTY_EVIDENCE = (): EvidenceDraft => ({
  reference: '',
  category: '',
  sha256: '',
  contentType: '',
  sizeBytes: ''
});

const HARD_APPROVAL_BLOCKS = new Set([
  'CONFIG_UNAVAILABLE',
  'INVALID_SOURCE_STATE',
  'LEGACY_REVIEW_REQUIRED',
  'REVIEW_NOT_STARTED',
  'CONSENT_REQUIRED',
  'CONSENT_VERSION_MISMATCH',
  'CONSENT_TIMESTAMP_INVALID',
  'CONSENT_SOURCE_INVALID'
]);

const statusLabel = (status: CounsellorVerificationStatus) => (
  status === 'pending' ? 'submitted' : status.replaceAll('_', ' ')
);

const statusVariant = (status: CounsellorVerificationStatus): BadgeVariant => {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'submitted' || status === 'under_review' || status === 'pending') return 'pending';
  if (status === 'suspended' || status === 'expired') return 'blocked';
  return 'default';
};

const actorLabel = (actor?: string | CounsellorAdminActor | null) => {
  if (!actor) return 'Not recorded';
  if (typeof actor === 'string') return actor;
  const name = `${actor.firstName || ''} ${actor.lastName || ''}`.trim();
  return name || actor.email || actor._id || 'Recorded administrator';
};

function DetailField({ label, value }: FieldProps) {
  const displayValue = value === undefined || value === null || value === '' ? 'Not provided' : value;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900 break-words">{displayValue}</p>
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

  const [startReviewModal, setStartReviewModal] = useState(false);
  const [approvalModal, setApprovalModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [suspendModal, setSuspendModal] = useState(false);
  const [expireModal, setExpireModal] = useState(false);
  const [reverifyModal, setReverifyModal] = useState(false);
  const [freshMfaModal, setFreshMfaModal] = useState(false);
  const [credModal, setCredModal] = useState<{
    open: boolean;
    username: string;
    emailSent?: boolean;
    emailRecipient?: string;
  }>({ open: false, username: '' });
  const [reason, setReason] = useState('');
  const [verificationExpiresAt, setVerificationExpiresAt] = useState('');
  const [evidenceDrafts, setEvidenceDrafts] = useState<EvidenceDraft[]>(() => [EMPTY_EVIDENCE()]);
  const [reviewAttested, setReviewAttested] = useState(false);

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

  const handleMfaRequired = (response: { code?: string }) => {
    if (response.code !== 'ADMIN_MFA_FRESHNESS_REQUIRED') return false;
    setFreshMfaModal(true);
    toast.error('Refresh administrator MFA, then retry this action.');
    return true;
  };

  const handleStartReview = async () => {
    if (!counsellor) return;
    setActionLoading('start-review');
    const res = await api.startCounsellorReview(counsellor.id || counsellor._id!);
    setActionLoading('');
    if (res.success) {
      toast.success('Credential review started');
      setStartReviewModal(false);
      await load();
    } else {
      if (handleMfaRequired(res)) return;
      toast.error(res.message || 'Failed to start review');
    }
  };

  const openApprovalModal = () => {
    setVerificationExpiresAt('');
    setEvidenceDrafts([EMPTY_EVIDENCE()]);
    setReviewAttested(false);
    setApprovalModal(true);
  };

  const updateEvidenceDraft = (index: number, field: keyof EvidenceDraft, value: string) => {
    setEvidenceDrafts((current) => current.map((draft, draftIndex) => (
      draftIndex === index ? { ...draft, [field]: value } : draft
    )));
  };

  const removeEvidenceDraft = (index: number) => {
    setEvidenceDrafts((current) => current.filter((_, draftIndex) => draftIndex !== index));
  };

  const handleApprove = async () => {
    if (!counsellor) return;
    const policyVersion = counsellor.requiredCredentialPolicyVersion?.trim();
    if (!policyVersion) {
      toast.error('Credential policy configuration is unavailable');
      return;
    }
    if (!reviewAttested) {
      toast.error('Confirm the credential review before approval');
      return;
    }

    const expiry = new Date(verificationExpiresAt);
    if (!verificationExpiresAt || Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      toast.error('Enter a future verification expiry');
      return;
    }
    if (evidenceDrafts.length === 0) {
      toast.error('At least one credential-evidence record is required');
      return;
    }

    const credentialEvidence: CounsellorCredentialEvidenceInput[] = [];
    for (const draft of evidenceDrafts) {
      const reference = draft.reference.trim();
      const category = draft.category.trim();
      const sha256 = draft.sha256.trim().toLowerCase();
      const contentType = draft.contentType.trim();
      const sizeBytes = draft.sizeBytes.trim() ? Number(draft.sizeBytes) : undefined;

      if (!reference || !category) {
        toast.error('Each evidence record needs an opaque reference and category');
        return;
      }
      if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) {
        toast.error('SHA-256 values must contain exactly 64 hexadecimal characters');
        return;
      }
      if (sizeBytes !== undefined && (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0)) {
        toast.error('Evidence size must be a positive whole number');
        return;
      }

      credentialEvidence.push({
        reference,
        category,
        ...(sha256 ? { sha256 } : {}),
        ...(contentType ? { contentType } : {}),
        ...(sizeBytes !== undefined ? { sizeBytes } : {})
      });
    }

    setActionLoading('approve');
    const res = await api.approveCounsellor(counsellor.id || counsellor._id!, {
      credentialEvidence,
      credentialPolicyVersion: policyVersion,
      verificationExpiresAt: expiry.toISOString()
    });
    setActionLoading('');
    if (res.success && res.data) {
      toast.success('Counsellor professionally approved');
      setApprovalModal(false);
      setCredModal({
        open: true,
        username: res.data.username,
        emailSent: res.data.credentialEmailSent,
        emailRecipient: res.data.credentialEmailRecipient
      });
      router.replace(`/counsellors/${res.data.counsellorId}`);
    } else {
      if (handleMfaRequired(res)) return;
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
      if (handleMfaRequired(res)) return;
      toast.error(res.message || 'Failed');
    }
  };

  const handleSendActivationLink = async () => {
    if (!counsellor) return;
    const counsellorId = counsellor.isPendingApplication
      ? counsellor.linkedCounsellor
      : counsellor.id || counsellor._id;
    if (!counsellorId) {
      toast.error('Linked counsellor profile is unavailable');
      return;
    }
    setActionLoading('creds');
    const res = await api.sendCounsellorActivationLink(counsellorId);
    setActionLoading('');
    if (res.success && res.data) {
      setCredModal({
        open: true,
        username: res.data.username,
        emailSent: res.data.activationEmailSent,
        emailRecipient: res.data.activationEmailRecipient
      });
    } else {
      if (handleMfaRequired(res)) return;
      toast.error(res.message || 'Failed to send setup link');
    }
  };

  const handleSuspend = async () => {
    if (!counsellor) return;
    if (!reason.trim()) { toast.error('Suspension reason required'); return; }
    const counsellorId = counsellor.isPendingApplication
      ? counsellor.linkedCounsellor
      : counsellor.id || counsellor._id;
    if (!counsellorId) {
      toast.error('Linked counsellor profile is unavailable');
      return;
    }
    setActionLoading('suspend');
    const res = await api.suspendCounsellor(counsellorId, reason.trim());
    setActionLoading('');
    if (res.success) {
      toast.success('Counsellor suspended');
      setSuspendModal(false);
      setReason('');
      await load();
    } else {
      if (handleMfaRequired(res)) return;
      toast.error(res.message || 'Failed to suspend counsellor');
    }
  };

  const handleExpireVerification = async () => {
    if (!counsellor) return;

    const expiresAt = counsellor.professionalVerification?.expiresAt;
    const expiryTime = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
    if (
      counsellor.isPendingApplication
      || counsellor.status !== 'approved'
      || !Number.isFinite(expiryTime)
      || expiryTime > Date.now()
    ) {
      setExpireModal(false);
      toast.error('This professional verification is no longer due for expiry');
      await load();
      return;
    }

    const counsellorId = counsellor.id || counsellor._id;
    if (!counsellorId) {
      toast.error('Counsellor profile is unavailable');
      return;
    }

    setActionLoading('expire');
    try {
      const res = await api.expireCounsellor(counsellorId);
      if (!res.success) {
        if (handleMfaRequired(res)) return;
        toast.error(res.message || 'Failed to record professional verification expiry');
        return;
      }

      toast.success('Professional verification marked expired');
      setExpireModal(false);
      await load();
    } catch {
      toast.error('Failed to record professional verification expiry');
    } finally {
      setActionLoading((current) => current === 'expire' ? '' : current);
    }
  };

  const handleSendReverificationInvite = async () => {
    if (!counsellor) return;
    const counsellorId = counsellor.isPendingApplication
      ? counsellor.linkedCounsellor
      : counsellor.id || counsellor._id;
    if (!counsellorId) {
      toast.error('Linked counsellor profile is unavailable');
      return;
    }
    setActionLoading('reverify-invite');
    const res = await api.sendCounsellorReverificationInvite(counsellorId);
    setActionLoading('');
    if (res.success && res.data) {
      toast.success(res.data.invitationEmailSent
        ? 'Secure re-verification invitation sent'
        : 'Invitation created, but email delivery failed');
      setReverifyModal(false);
    } else {
      if (handleMfaRequired(res)) return;
      toast.error(res.message || 'Failed to create re-verification invitation');
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
  const isLegacyApplication = isApplication && counsellor.legacyReviewRequired === true;
  const isSubmitted = counsellor.status === 'submitted' || counsellor.status === 'pending';
  const isUnderReview = counsellor.status === 'under_review';
  const isApproved = counsellor.status === 'approved';
  const isReverificationEligible = (
    counsellor.status === 'suspended'
    || counsellor.status === 'expired'
    || (
      counsellor.status === 'draft'
      && counsellor.professionalVerification?.legacyReviewRequired === true
    )
    || (isLegacyApplication && Boolean(counsellor.linkedCounsellor))
  );
  const onboardingConsent = counsellor.onboardingConsent
    || counsellor.professionalVerification?.onboardingConsent;
  const credentialReview = counsellor.credentialReview
    || counsellor.professionalVerification?.credentialReview;
  const reviewStartedBy = counsellor.reviewStartedBy
    || counsellor.professionalVerification?.reviewStartedBy;
  const reviewStartedAt = counsellor.reviewStartedAt
    || counsellor.professionalVerification?.reviewStartedAt;
  const decisionBy = counsellor.decisionBy
    || counsellor.professionalVerification?.approvedBy
    || counsellor.approvedBy;
  const decisionAt = counsellor.decisionAt
    || counsellor.professionalVerification?.approvedAt
    || counsellor.approvedAt;
  const approvalExpiresAt = counsellor.verificationExpiresAt
    || counsellor.professionalVerification?.expiresAt;
  const professionalVerificationExpiryTime = counsellor.professionalVerification?.expiresAt
    ? new Date(counsellor.professionalVerification.expiresAt).getTime()
    : Number.NaN;
  const isProfessionalVerificationExpiryDue = (
    !isApplication
    && isApproved
    && Number.isFinite(professionalVerificationExpiryTime)
    && professionalVerificationExpiryTime <= Date.now()
  );
  const approvalBlockingReasons = counsellor.approvalBlockingReasons || [];
  const hardApprovalBlocks = approvalBlockingReasons.filter((reasonCode) => (
    HARD_APPROVAL_BLOCKS.has(reasonCode)
  ));
  const todayStats = (allStats?.today as { total: number; completed: number; cancelled: number }) || EMPTY_BOOKING_TOTALS.today;
  const monthStats = (allStats?.thisMonth as { total: number; revenue: number }) || EMPTY_BOOKING_TOTALS.thisMonth;
  const badgeVariant = statusVariant(counsellor.status);

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900">
          <ArrowLeft size={16} /> Back to Counsellors
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isSubmitted && isApplication && !isLegacyApplication ? (
            <button
              onClick={() => setStartReviewModal(true)}
              disabled={counsellor.canStartReview === false}
              title={counsellor.canStartReview === false ? 'This application cannot enter review' : undefined}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileCheck2 size={15} /> Start review
            </button>
          ) : null}
          {isUnderReview && isApplication && !isLegacyApplication ? (
            <>
              <button
                onClick={openApprovalModal}
                disabled={hardApprovalBlocks.length > 0 || !counsellor.requiredCredentialPolicyVersion}
                title={hardApprovalBlocks.length > 0 ? 'Resolve the displayed approval blockers first' : undefined}
                className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle size={15} /> Review evidence and approve
              </button>
              <button onClick={() => { setRejectModal(true); setReason(''); }} className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100">
                <span className="flex items-center gap-1.5"><XCircle size={15} /> Reject</span>
              </button>
            </>
          ) : null}
          {isUnderReview && !isApplication && counsellor.professionalVerification?.application ? (
            <button
              onClick={() => router.push(`/counsellors/${counsellor.professionalVerification?.application}`)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <FileCheck2 size={15} /> Open retained application
            </button>
          ) : null}
          {isApproved ? (
            <>
              {isProfessionalVerificationExpiryDue ? (
                <button
                  onClick={() => setExpireModal(true)}
                  disabled={!!actionLoading}
                  className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <XCircle size={15} /> Mark verification expired
                </button>
              ) : null}
              <button onClick={handleSendActivationLink} disabled={!!actionLoading} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60">
                <Key size={15} /> {actionLoading === 'creds' ? 'Sending...' : 'Send setup link'}
              </button>
              <button onClick={() => { setSuspendModal(true); setReason(''); }} className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200">
                <Lock size={15} /> Suspend
              </button>
            </>
          ) : null}
          {isReverificationEligible ? (
            <button onClick={() => { setReverifyModal(true); setReason(''); }} className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100">
              <RotateCcw size={15} /> Re-verification instructions
            </button>
          ) : null}
        </div>
      </div>

      {isLegacyApplication ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
          This migrated application does not contain current retained consent and cannot continue
          through credential review. Send the linked counsellor a secure re-verification invitation
          so they can submit a fresh application under the current notice.
        </div>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-xl font-bold text-blue-700">
            {getInitials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">{displayName || 'Unnamed applicant'}</h2>
              <Badge variant={badgeVariant}>{statusLabel(counsellor.status)}</Badge>
              {isApplication && <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">Application profile</span>}
            </div>
            <div className="mt-3 grid gap-3 text-sm text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
              <span className="flex items-center gap-2"><Mail size={14} className="text-gray-400" /> {counsellor.user.email}</span>
              <span className="flex items-center gap-2"><Phone size={14} className="text-gray-400" /> {counsellor.user.phone || 'No phone'}</span>
              <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-gray-400" /> Self-declared license {counsellor.licenseNumber || 'missing'}</span>
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
        {counsellor.status === 'suspended' && (counsellor.blockedReason || counsellor.professionalVerification?.suspensionReason) ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>Suspended:</strong> {counsellor.blockedReason || counsellor.professionalVerification?.suspensionReason}
            {counsellor.blockedAt || counsellor.professionalVerification?.suspendedAt
              ? ` - ${formatDate(counsellor.blockedAt || counsellor.professionalVerification?.suspendedAt || '')}`
              : ''}
          </div>
        ) : null}
      </section>

      <SectionCard title="Professional Verification" icon={FileCheck2}>
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
          Self-declared profile fields shown elsewhere on this page are applicant claims. They are
          not reviewed credential evidence.
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField label="Lifecycle state" value={statusLabel(counsellor.status)} />
          <DetailField label="Review started by" value={actorLabel(reviewStartedBy)} />
          <DetailField label="Review started at" value={reviewStartedAt ? formatDateTime(reviewStartedAt) : null} />
          <DetailField
            label="Professional eligibility"
            value={counsellor.professionallyEligible === undefined
              ? 'Not evaluated on this record'
              : counsellor.professionallyEligible ? 'Eligible' : 'Not eligible'}
          />
          <DetailField label="Consent accepted" value={onboardingConsent?.accepted === true ? 'Yes' : 'No / not recorded'} />
          <DetailField label="Consent version" value={onboardingConsent?.version} />
          <DetailField label="Consent accepted at" value={onboardingConsent?.acceptedAt ? formatDateTime(onboardingConsent.acceptedAt) : null} />
          <DetailField label="Consent source" value={onboardingConsent?.source} />
          <DetailField label="Credential decision" value={credentialReview?.decision} />
          <DetailField label="Reviewed policy version" value={credentialReview?.policyVersion} />
          <DetailField label="Credential reviewer" value={actorLabel(credentialReview?.reviewedBy)} />
          <DetailField label="Credential reviewed at" value={credentialReview?.reviewedAt ? formatDateTime(credentialReview.reviewedAt) : null} />
          <DetailField label="Decision by" value={actorLabel(decisionBy)} />
          <DetailField label="Decision at" value={decisionAt ? formatDateTime(decisionAt) : null} />
          <DetailField
            label="Reviewed evidence records"
            value={credentialReview?.evidenceIds?.length ?? counsellor.credentialEvidence?.length ?? 0}
          />
          <DetailField label="Verification expiry" value={approvalExpiresAt ? formatDateTime(approvalExpiresAt) : null} />
          {counsellor.requiredCredentialPolicyVersion ? (
            <DetailField label="Required policy version" value={counsellor.requiredCredentialPolicyVersion} />
          ) : null}
          {counsellor.professionalVerification?.legacyReviewRequired ? (
            <DetailField label="Legacy review required" value="Yes — fail-closed review" />
          ) : null}
        </div>

        {counsellor.credentialEvidence?.length ? (
          <div className="mt-5 space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Retained evidence metadata</p>
            {counsellor.credentialEvidence.map((evidence, index) => (
              <div key={evidence._id || `${evidence.reference}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailField label="Opaque reference" value={evidence.reference} />
                  <DetailField label="Category" value={evidence.category} />
                  <DetailField label="Review decision" value={evidence.review?.decision} />
                  <DetailField label="SHA-256" value={evidence.sha256} />
                  <DetailField label="Content type" value={evidence.contentType} />
                  <DetailField label="Size (bytes)" value={evidence.sizeBytes} />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {isUnderReview && approvalBlockingReasons.length > 0 ? (
          <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
            hardApprovalBlocks.length > 0
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}>
            <p className="font-semibold">
              {hardApprovalBlocks.length > 0 ? 'Approval is blocked' : 'Current pre-approval record is incomplete'}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs">
              {approvalBlockingReasons.map((reasonCode) => <li key={reasonCode}>{reasonCode}</li>)}
            </ul>
            {hardApprovalBlocks.length === 0 ? (
              <p className="mt-2 text-xs leading-5">
                Evidence metadata and expiry are recorded only when the administrator completes the
                approval form.
              </p>
            ) : null}
          </div>
        ) : null}
      </SectionCard>

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
        <SectionCard title="Self-declared Profile" icon={UserRound}>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Email" value={counsellor.user.email} />
            <DetailField label="Phone" value={counsellor.user.phone} />
            <DetailField label="Date of birth" value={counsellor.dateOfBirth ? formatDate(counsellor.dateOfBirth) : null} />
            <DetailField label="Gender" value={counsellor.gender} />
            <DetailField label="Self-declared license number" value={counsellor.licenseNumber} />
            <DetailField label="Currency" value={counsellor.currency || 'INR'} />
          </div>
        </SectionCard>

        <SectionCard title="Self-declared Specializations" icon={Award}>
          <TagList tags={counsellor.specializations?.length ? counsellor.specializations : counsellor.specialization ? [counsellor.specialization] : []} />
          <div className="mt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Languages</p>
            <TagList tags={counsellor.languages} />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Self-declared Education" icon={GraduationCap}>
          <EducationList education={counsellor.education} />
        </SectionCard>

        <SectionCard title="Self-declared Certifications" icon={ShieldCheck}>
          <CertificationList certifications={counsellor.certifications} />
        </SectionCard>
      </div>

      <SectionCard title="Applicant-provided Availability" icon={Calendar}>
        <AvailabilityGrid availability={counsellor.availability} />
      </SectionCard>

      {isApproved && !isApplication ? (
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
      ) : null}

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

      <Modal open={startReviewModal} onClose={() => setStartReviewModal(false)} title="Start Credential Review" size="sm">
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
            This creates a dormant account and professional profile, then moves the submitted
            application into credential review. It does not approve the counsellor or enable access.
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStartReviewModal(false)} className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleStartReview}
              disabled={actionLoading === 'start-review'}
              className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {actionLoading === 'start-review' ? 'Starting...' : 'Start review'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={approvalModal} onClose={() => setApprovalModal(false)} title="Review Evidence and Approve" size="lg">
        <div className="space-y-5">
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
            Approval will record these evidence references as reviewed, activate the professional
            account, and bind the decision to policy version{' '}
            <code className="rounded bg-blue-100 px-1.5 py-0.5 font-mono font-semibold">
              {counsellor.requiredCredentialPolicyVersion || 'configuration unavailable'}
            </code>.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Onboarding consent</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {onboardingConsent?.accepted ? `Accepted — ${onboardingConsent.version || 'version missing'}` : 'Not recorded'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Review state</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{statusLabel(counsellor.status)}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-bold text-gray-900">Credential-evidence metadata</h4>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Enter opaque references and metadata only. Do not paste credential document contents.
              </p>
            </div>

            {evidenceDrafts.map((draft, index) => (
              <div key={index} className="rounded-xl border border-gray-200 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-800">Evidence record {index + 1}</p>
                  {evidenceDrafts.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeEvidenceDraft(index)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium text-gray-700">
                    Opaque reference <span className="text-red-500">*</span>
                    <input
                      value={draft.reference}
                      onChange={(event) => updateEvidenceDraft(index, 'reference', event.target.value)}
                      maxLength={512}
                      placeholder="Repository or object reference"
                      className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Category <span className="text-red-500">*</span>
                    <input
                      value={draft.category}
                      onChange={(event) => updateEvidenceDraft(index, 'category', event.target.value)}
                      maxLength={100}
                      placeholder="Category from the approved procedure"
                      className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    SHA-256 (optional)
                    <input
                      value={draft.sha256}
                      onChange={(event) => updateEvidenceDraft(index, 'sha256', event.target.value)}
                      maxLength={64}
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="64 hexadecimal characters"
                      className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2 font-mono text-xs font-normal focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Content type (optional)
                    <input
                      value={draft.contentType}
                      onChange={(event) => updateEvidenceDraft(index, 'contentType', event.target.value)}
                      maxLength={100}
                      placeholder="Recorded media type"
                      className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Size in bytes (optional)
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={draft.sizeBytes}
                      onChange={(event) => updateEvidenceDraft(index, 'sizeBytes', event.target.value)}
                      placeholder="Positive whole number"
                      className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setEvidenceDrafts((current) => [...current, EMPTY_EVIDENCE()])}
              disabled={evidenceDrafts.length >= 50}
              className="flex items-center gap-1.5 rounded-xl border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              <Plus size={15} /> Add evidence record
            </button>
          </div>

          <label className="block text-sm font-medium text-gray-700">
            Verification expiry <span className="text-red-500">*</span>
            <input
              type="datetime-local"
              value={verificationExpiresAt}
              onChange={(event) => setVerificationExpiresAt(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="mt-1.5 block text-xs font-normal leading-5 text-gray-500">
              Enter a future date authorized by the applicable policy. No default duration is assumed.
            </span>
          </label>

          <div className="space-y-2">
            <p className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs leading-5 text-purple-800">
              <strong>CLINICAL ACTION:</strong> Confirm acceptable qualifications, evidence categories,
              and reviewer authority under the approved credential-review procedure.
            </p>
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              <strong>LEGAL ACTION:</strong> Confirm permitted evidence-reference retention and the
              authorized verification expiry. This interface does not define either policy.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3">
            <input
              type="checkbox"
              checked={reviewAttested}
              onChange={(event) => setReviewAttested(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm leading-6 text-gray-700">
              I confirm that I reviewed every referenced evidence record under the exact policy
              version shown above and intend to approve this professional verification.
            </span>
          </label>

          <div className="flex gap-2">
            <button onClick={() => setApprovalModal(false)} className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={actionLoading === 'approve' || !reviewAttested}
              className="flex-1 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {actionLoading === 'approve' ? 'Approving...' : 'Approve professional verification'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Reject Application" size="sm">
        <div className="space-y-4">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            The applicant can see this reason. Record only an appropriate external explanation;
            do not include internal notes or sensitive reviewer commentary.
          </p>
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            Rejection is permitted only from the under-review state and keeps the professional
            account inactive.
          </p>
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
            <button onClick={handleReject} disabled={actionLoading === 'reject'} className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {actionLoading === 'reject' ? 'Rejecting...' : 'Confirm Reject'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={suspendModal} onClose={() => setSuspendModal(false)} title="Suspend Counsellor" size="sm">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-600">
            Suspension disables the account and professional eligibility. Re-verification is
            required before the counsellor can be approved again.
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Suspension reason</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              placeholder="Record the reason for suspension..."
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSuspendModal(false)} className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSuspend} disabled={actionLoading === 'suspend'} className="flex-1 rounded-xl bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60">
              {actionLoading === 'suspend' ? 'Suspending...' : 'Suspend counsellor'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={expireModal} onClose={() => setExpireModal(false)} title="Record Verification Expiry" size="sm">
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
            This professional verification reached its recorded expiry on{' '}
            <strong>{counsellor.professionalVerification?.expiresAt
              ? formatDateTime(counsellor.professionalVerification.expiresAt)
              : 'an unavailable date'}</strong>.
            Recording the expiry will deactivate the counsellor&apos;s professional access and
            revoke active sessions. It does not renew or extend the verification.
          </div>
          <p className="text-xs leading-5 text-gray-500">
            A fresh multi-factor authenticated administrator session is required.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setExpireModal(false)}
              disabled={actionLoading === 'expire'}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={handleExpireVerification}
              disabled={actionLoading === 'expire'}
              className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {actionLoading === 'expire' ? 'Recording...' : 'Confirm expiry'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={reverifyModal} onClose={() => setReverifyModal(false)} title="Fresh Consent Required" size="sm">
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            The counsellor must submit a new retained application through the counsellor registration
            portal and accept the current onboarding notice. An administrator cannot record consent
            on the counsellor&apos;s behalf. The profile remains inactive meanwhile.
          </div>
          <div className="flex gap-2">
            <button onClick={() => setReverifyModal(false)} className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button
              onClick={handleSendReverificationInvite}
              disabled={actionLoading === 'reverify-invite'}
              className="flex-1 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {actionLoading === 'reverify-invite' ? 'Sending...' : 'Send secure link'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={credModal.open} onClose={() => setCredModal({ open: false, username: '' })} title="Password Setup Link" size="sm">
        <div className="space-y-4">
          <div className={`rounded-xl border px-4 py-3 text-sm ${credModal.emailSent === true ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            {credModal.emailSent === true
              ? `A one-time password setup link was emailed to ${credModal.emailRecipient || credModal.username}.`
              : credModal.emailSent === false
                ? 'The setup link could not be emailed. Retry after email delivery is restored.'
                : 'Setup-link delivery status was not returned.'}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Username</label>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
              <code className="break-all font-mono text-sm text-gray-800">{credModal.username}</code>
            </div>
          </div>
          <button onClick={() => setCredModal({ open: false, username: '' })} className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Done</button>
        </div>
      </Modal>

      <FreshAdminMfaModal
        open={freshMfaModal}
        onClose={() => setFreshMfaModal(false)}
        onRefreshed={() => {
          setFreshMfaModal(false);
          toast.success('Administrator MFA refreshed. Retry the action.');
        }}
      />
    </div>
  );
}
