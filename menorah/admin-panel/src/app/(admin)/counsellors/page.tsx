'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCheck, ChevronRight, Copy, Search } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import FreshAdminMfaModal from '@/components/auth/FreshAdminMfaModal';
import { api } from '@/lib/api';
import { formatDate, formatCurrency, getInitials } from '@/lib/utils';
import type { Counsellor } from '@/types';
import toast from 'react-hot-toast';

const STATUS_TABS = [
  { key: 'draft', label: 'Legacy Drafts' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'expired', label: 'Expired' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' }
] as const;

const EMPTY_TARGET = { open: false, id: '', name: '' };

type BadgeVariant = 'pending' | 'approved' | 'rejected' | 'blocked' | 'default';

const statusLabel = (status: Counsellor['status']) => (
  status === 'pending' ? 'submitted' : status.replaceAll('_', ' ')
);

const statusVariant = (status: Counsellor['status']): BadgeVariant => {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'draft' || status === 'submitted' || status === 'under_review' || status === 'pending') return 'pending';
  if (status === 'suspended' || status === 'expired') return 'blocked';
  return 'default';
};

function CounsellorsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedStatus = searchParams.get('status');
  const initialStatus = requestedStatus === 'pending'
    ? 'submitted'
    : STATUS_TABS.some((tab) => tab.key === requestedStatus)
      ? requestedStatus!
      : 'submitted';
  const [counsellors, setCounsellors] = useState<Counsellor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState(initialStatus);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  // Modals
  const [startReviewModal, setStartReviewModal] = useState(EMPTY_TARGET);
  const [rejectModal, setRejectModal] = useState(EMPTY_TARGET);
  const [suspendModal, setSuspendModal] = useState(EMPTY_TARGET);
  const [reverifyModal, setReverifyModal] = useState(EMPTY_TARGET);
  const [freshMfaModal, setFreshMfaModal] = useState(false);
  const [credModal, setCredModal] = useState<{
    open: boolean;
    username: string;
    emailSent?: boolean;
    emailRecipient?: string;
  }>({ open: false, username: '' });
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [copied, setCopied] = useState('');
  const requestSequence = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setLoadError('');
    setCounsellors([]);
    setTotal(0);
    setPages(1);
    const res = await api.getCounsellors(
      { status: activeTab, page, limit: 15, search: search || undefined },
      signal
    );
    if (signal?.aborted || requestId !== requestSequence.current) return;
    if (res.success && res.data) {
      setCounsellors(res.data.counsellors);
      setTotal(res.data.pagination.total);
      setPages(res.data.pagination.pages);
    } else {
      setLoadError(res.message || 'Unable to load counsellors.');
    }
    setLoading(false);
  }, [activeTab, page, search]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const handleMfaRequired = (response: { code?: string }) => {
    if (response.code !== 'ADMIN_MFA_FRESHNESS_REQUIRED') return false;
    setFreshMfaModal(true);
    toast.error('Refresh administrator MFA, then retry this action.');
    return true;
  };

  const handleStartReview = async () => {
    const { id, name } = startReviewModal;
    setActionLoading(id + '-start-review');
    const res = await api.startCounsellorReview(id);
    setActionLoading('');
    if (res.success) {
      toast.success(`${name} moved to credential review`);
      setStartReviewModal(EMPTY_TARGET);
      await load();
    } else {
      if (handleMfaRequired(res)) return;
      toast.error(res.message || 'Failed to start review');
    }
  };

  const handleReject = async () => {
    if (!reason.trim()) { toast.error('Please enter a rejection reason'); return; }
    setActionLoading(rejectModal.id + '-reject');
    const res = await api.rejectCounsellor(rejectModal.id, reason);
    setActionLoading('');
    if (res.success) {
      toast.success('Application rejected');
      setRejectModal(EMPTY_TARGET);
      setReason('');
      await load();
    } else {
      if (handleMfaRequired(res)) return;
      toast.error(res.message || 'Failed to reject');
    }
  };

  const handleSendActivationLink = async (id: string) => {
    setActionLoading(id + '-creds');
    const res = await api.sendCounsellorActivationLink(id);
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
    if (!reason.trim()) { toast.error('Please enter a suspension reason'); return; }
    setActionLoading(suspendModal.id + '-suspend');
    const res = await api.suspendCounsellor(suspendModal.id, reason.trim());
    setActionLoading('');
    if (res.success) {
      toast.success('Counsellor suspended');
      setSuspendModal(EMPTY_TARGET);
      setReason('');
      await load();
    } else {
      if (handleMfaRequired(res)) return;
      toast.error(res.message || 'Failed to suspend counsellor');
    }
  };

  const handleSendReverificationInvite = async () => {
    setActionLoading(reverifyModal.id + '-reverify-invite');
    const res = await api.sendCounsellorReverificationInvite(reverifyModal.id);
    setActionLoading('');
    if (res.success && res.data) {
      toast.success(res.data.invitationEmailSent
        ? 'Secure re-verification invitation sent'
        : 'Invitation created, but email delivery failed');
      setReverifyModal(EMPTY_TARGET);
    } else {
      if (handleMfaRequired(res)) return;
      toast.error(res.message || 'Failed to create re-verification invitation');
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Counsellors</h2>
          <p className="text-sm text-gray-500 mt-0.5">{total} total · {STATUS_TABS.find(t => t.key === activeTab)?.label}</p>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-64"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(1); }}
            className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-10 h-10 bg-gray-100 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-100 rounded w-32" />
                  <div className="h-3 bg-gray-100 rounded w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="space-y-3 py-12 text-center">
            <p className="text-sm font-medium text-red-700">{loadError}</p>
            <button
              onClick={() => void load()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : counsellors.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-sm">No counsellors found in this category.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {counsellors.map((c) => (
              <div key={c.id} className="flex items-start sm:items-center gap-4 px-5 py-4 hover:bg-gray-50 flex-col sm:flex-row">
                {/* Avatar + basic info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm flex-shrink-0">
                    {getInitials(`${c.user?.firstName ?? ''} ${c.user?.lastName ?? ''}`)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.user?.firstName} {c.user?.lastName}</p>
                    <p className="text-xs text-gray-500 truncate">{c.user?.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{c.specialization} · {c.experience}y exp · {formatCurrency(c.hourlyRate)}/hr</p>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant={statusVariant(c.status)}>{statusLabel(c.status)}</Badge>
                  <span className="text-xs text-gray-400">{formatDate(c.createdAt)}</span>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    {(
                      (c.status === 'submitted' || c.status === 'pending')
                      && c.isPendingApplication
                      && c.legacyReviewRequired !== true
                      && c.canStartReview !== false
                    ) ? (
                      <button
                        onClick={() => {
                          setStartReviewModal({
                            open: true,
                            id: c.id,
                            name: `${c.user?.firstName ?? ''} ${c.user?.lastName ?? ''}`.trim()
                          });
                        }}
                        className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                      >
                        Start review
                      </button>
                    ) : null}
                    {(
                      c.status === 'under_review'
                      && c.isPendingApplication
                      && c.legacyReviewRequired !== true
                    ) ? (
                      <>
                        <button
                          onClick={() => router.push(`/counsellors/${c.id}`)}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                        >
                          Review evidence
                        </button>
                        <button
                          onClick={() => { setRejectModal({ open: true, id: c.id, name: `${c.user?.firstName ?? ''} ${c.user?.lastName ?? ''}` }); setReason(''); }}
                          className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    ) : null}
                    {c.status === 'approved' ? (
                      <>
                        {(() => {
                          const expiryTime = c.professionalVerification?.expiresAt
                            ? new Date(c.professionalVerification.expiresAt).getTime()
                            : Number.NaN;
                          return Number.isFinite(expiryTime) && expiryTime > Date.now() ? (
                            <button
                              onClick={() => handleSendActivationLink(c.id)}
                              disabled={actionLoading === c.id + '-creds'}
                              className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
                            >
                              {actionLoading === c.id + '-creds' ? '...' : 'Send setup link'}
                            </button>
                          ) : (
                            <span className="rounded-lg bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                              Expiry reconciliation required
                            </span>
                          );
                        })()}
                        <button
                          onClick={() => {
                            setSuspendModal({
                              open: true,
                              id: c.id,
                              name: `${c.user?.firstName ?? ''} ${c.user?.lastName ?? ''}`.trim()
                            });
                            setReason('');
                          }}
                          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
                        >
                          Suspend
                        </button>
                      </>
                    ) : null}
                    {(
                      c.status === 'suspended'
                      || c.status === 'expired'
                      || (
                        c.status === 'draft'
                        && c.professionalVerification?.legacyReviewRequired === true
                      )
                      || (
                        c.isPendingApplication
                        && c.legacyReviewRequired === true
                        && Boolean(c.linkedCounsellor)
                      )
                    ) ? (
                      <button
                        onClick={() => {
                          setReverifyModal({
                            open: true,
                            id: c.linkedCounsellor || c.id,
                            name: `${c.user?.firstName ?? ''} ${c.user?.lastName ?? ''}`.trim()
                          });
                          setReason('');
                        }}
                        className="px-3 py-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Re-verification instructions
                      </button>
                    ) : null}
                    <button
                      onClick={() => router.push(`/counsellors/${c.id}`)}
                      aria-label={`View ${c.user?.firstName ?? 'counsellor'} ${c.user?.lastName ?? ''} details`}
                      title="View details"
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {page} of {pages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={startReviewModal.open}
        onClose={() => setStartReviewModal(EMPTY_TARGET)}
        title={`Start review: ${startReviewModal.name}`}
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
            This creates a dormant account and professional profile, then moves the submitted
            application into credential review. It does not approve the counsellor or enable access.
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStartReviewModal(EMPTY_TARGET)} className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleStartReview}
              disabled={actionLoading === startReviewModal.id + '-start-review'}
              className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {actionLoading === startReviewModal.id + '-start-review' ? 'Starting...' : 'Start review'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal open={rejectModal.open} onClose={() => setRejectModal(EMPTY_TARGET)} title={`Reject: ${rejectModal.name}`} size="sm">
        <div className="space-y-4">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            Rejection is available only after credential review has started. The applicant can see
            this reason, so do not include internal notes or sensitive reviewer commentary.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Rejection Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Explain why this application is being rejected..."
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setRejectModal(EMPTY_TARGET)} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleReject} disabled={actionLoading === rejectModal.id + '-reject'} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors">
              {actionLoading === rejectModal.id + '-reject' ? 'Rejecting...' : 'Confirm Reject'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={suspendModal.open} onClose={() => setSuspendModal(EMPTY_TARGET)} title={`Suspend: ${suspendModal.name}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-600">
            Suspension disables the account and removes professional eligibility. Re-verification is
            required before the counsellor can be approved again.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Suspension reason</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="Record the reason for suspension..."
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSuspendModal(EMPTY_TARGET)} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button
              onClick={handleSuspend}
              disabled={actionLoading === suspendModal.id + '-suspend'}
              className="flex-1 rounded-xl bg-gray-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-900 disabled:opacity-60"
            >
              {actionLoading === suspendModal.id + '-suspend' ? 'Suspending...' : 'Suspend counsellor'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={reverifyModal.open} onClose={() => setReverifyModal(EMPTY_TARGET)} title={`Fresh consent required: ${reverifyModal.name}`} size="sm">
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            The counsellor must submit a new retained application through the counsellor registration
            portal and accept the current onboarding notice. An administrator cannot record that
            consent on the counsellor&apos;s behalf. The profile remains inactive meanwhile.
          </div>
          <div className="flex gap-2">
            <button onClick={() => setReverifyModal(EMPTY_TARGET)} className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button
              onClick={handleSendReverificationInvite}
              disabled={actionLoading === reverifyModal.id + '-reverify-invite'}
              className="flex-1 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {actionLoading === reverifyModal.id + '-reverify-invite' ? 'Sending...' : 'Send secure link'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Activation link result */}
      <Modal open={credModal.open} onClose={() => setCredModal({ open: false, username: '' })} title="Password setup link" size="sm">
        <div className="space-y-4">
          <div className={`border rounded-xl px-4 py-3 text-sm ${credModal.emailSent === true ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
            {credModal.emailSent === true
              ? `A one-time password setup link was emailed to ${credModal.emailRecipient || credModal.username}.`
              : credModal.emailSent === false
                ? 'The setup link could not be emailed. Retry after email delivery is restored.'
                : 'Setup-link delivery status was not returned.'}
          </div>
          {[
            { label: 'Username (Email)', value: credModal.username, key: 'user' }
          ].map(({ label, value, key }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                <code className="flex-1 text-sm font-mono text-gray-800 break-all">{value}</code>
                <button onClick={() => copyToClipboard(value, key)} className="text-gray-400 hover:text-blue-600 flex-shrink-0">
                  {copied === key ? <CheckCheck size={16} className="text-green-500" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          ))}
          <button onClick={() => setCredModal({ open: false, username: '' })} className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors mt-1">
            Done
          </button>
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

export default function CounsellorsPage() {
  return (
    <Suspense>
      <CounsellorsContent />
    </Suspense>
  );
}
