'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, CheckCircle2, RotateCw, ShieldAlert, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import type { KycReview, KycStatus } from '@/types';

type ReviewFilter = 'manual_review' | 'verified' | 'rejected' | 'all';

const filters: { label: string; value: ReviewFilter }[] = [
  { label: 'Needs Review', value: 'manual_review' },
  { label: 'Verified', value: 'verified' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All', value: 'all' },
];

const statusStyles: Record<KycStatus, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  pending: 'bg-blue-100 text-blue-700',
  manual_review: 'bg-amber-100 text-amber-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const statusLabel = (status: string) =>
  status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export default function EkycReviewsPage() {
  const [filter, setFilter] = useState<ReviewFilter>('manual_review');
  const [reviews, setReviews] = useState<KycReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<KycReview | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadReviews = async (nextFilter = filter) => {
    setLoading(true);
    const response = await api.getKycReviews({ status: nextFilter, limit: 50 });
    if (response.success && response.data) {
      setReviews(response.data.reviews);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadReviews(filter);
  }, [filter]);

  const approve = async (review: KycReview) => {
    setActionId(review.id);
    const response = await api.approveKycReview(review.id);
    setActionId(null);
    if (response.success) {
      await loadReviews();
    }
  };

  const reject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;

    setActionId(rejectTarget.id);
    const response = await api.rejectKycReview(rejectTarget.id, rejectReason.trim());
    setActionId(null);
    if (response.success) {
      setRejectTarget(null);
      setRejectReason('');
      await loadReviews();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Face Check Reviews</h1>
          <p className="mt-1 text-sm text-gray-500">Review face checks that require manual admin action.</p>
        </div>
        <button
          onClick={() => loadReviews()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <RotateCw size={16} />
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 flex-shrink-0 text-amber-600" size={20} />
          <div>
            <p className="text-sm font-bold text-amber-900">Manual review policy</p>
            <p className="mt-1 text-sm text-amber-800">
              Reviews are created when a clear single face is not detected or the confidence is below threshold.
              Do not use detected sex, gender, emotion, or appearance attributes for decisions.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.value}
            onClick={() => setFilter(item.value)}
            className={cn(
              'min-h-10 rounded-lg px-4 text-sm font-semibold transition-colors',
              filter === item.value
                ? 'bg-blue-600 text-white'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">User</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Face Check</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Submitted</th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-gray-500">Loading reviews...</td>
                </tr>
              ) : reviews.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-gray-500">No face-check reviews found.</td>
                </tr>
              ) : reviews.map((review) => (
                <tr key={review.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-gray-900">
                      {review.user?.firstName} {review.user?.lastName}
                    </div>
                    <div className="text-sm text-gray-500">{review.user?.email}</div>
                    <div className="text-xs text-gray-400">{review.user?.phone}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-bold', statusStyles[review.status])}>
                      {statusLabel(review.status)}
                    </span>
                    {review.failureReason ? (
                      <p className="mt-2 max-w-xs text-xs text-gray-500">{review.failureReason}</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {typeof review.faceCheckConfidence === 'number'
                      ? `${review.faceCheckConfidence.toFixed(1)}%`
                      : 'Not available'}
                    {typeof review.threshold === 'number' ? (
                      <p className="text-xs text-gray-400">Threshold {review.threshold}%</p>
                    ) : null}
                    {typeof review.faceCount === 'number' ? (
                      <p className="text-xs text-gray-400">Faces detected {review.faceCount}</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">
                    {review.submittedAt ? formatDateTime(review.submittedAt) : formatDateTime(review.createdAt)}
                  </td>
                  <td className="px-5 py-4">
                    {review.status === 'manual_review' ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => approve(review)}
                          disabled={actionId === review.id}
                          className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                        >
                          <CheckCircle2 size={15} />
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectTarget(review)}
                          disabled={actionId === review.id}
                          className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          <XCircle size={15} />
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end text-gray-400">
                        <BadgeCheck size={18} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rejectTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">Reject Face Check</h2>
            <p className="mt-1 text-sm text-gray-500">
              Add a short reason for {rejectTarget.user?.firstName} {rejectTarget.user?.lastName}.
            </p>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              className="mt-4 min-h-28 w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Reason"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                className="min-h-10 rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={reject}
                disabled={!rejectReason.trim() || actionId === rejectTarget.id}
                className="min-h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
