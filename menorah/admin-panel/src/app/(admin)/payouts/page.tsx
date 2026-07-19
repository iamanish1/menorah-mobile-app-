'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Send, RefreshCw, Filter, CheckCircle2, Clock, XCircle,
  AlertCircle, ChevronDown, ExternalLink, IndianRupee, Building2
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { PayoutRecord, PayoutStatus } from '@/types';
import toast from 'react-hot-toast';

const STATUS_OPTIONS: { value: PayoutStatus | ''; label: string }[] = [
  { value: '',           label: 'All Statuses' },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
  { value: 'processing', label: 'Processing'   },
  { value: 'queued',     label: 'Queued'        },
  { value: 'pending',    label: 'Pending'       },
  { value: 'on_hold',    label: 'On Hold'       },
  { value: 'processed',  label: 'Processed'     },
  { value: 'reversed',   label: 'Reversed'      },
  { value: 'cancelled',  label: 'Cancelled'     },
  { value: 'failed',     label: 'Failed'        },
  { value: 'rejected',   label: 'Rejected'      },
  { value: 'expired',    label: 'Expired'       },
];

function statusMeta(status: PayoutStatus) {
  switch (status) {
    case 'awaiting_approval': return { color: 'bg-amber-100 text-amber-800', icon: Clock, dot: 'bg-amber-500' };
    case 'processed':  return { color: 'bg-green-100 text-green-700',  icon: CheckCircle2, dot: 'bg-green-500'  };
    case 'processing': return { color: 'bg-blue-100 text-blue-700',    icon: Clock,        dot: 'bg-blue-500'   };
    case 'queued':     return { color: 'bg-blue-100 text-blue-700',    icon: Clock,        dot: 'bg-blue-400'   };
    case 'pending':    return { color: 'bg-yellow-100 text-yellow-700',icon: Clock,        dot: 'bg-yellow-500' };
    case 'on_hold':    return { color: 'bg-orange-100 text-orange-700',icon: AlertCircle,  dot: 'bg-orange-500' };
    case 'failed':     return { color: 'bg-red-100 text-red-700',      icon: XCircle,      dot: 'bg-red-500'    };
    case 'reversed':   return { color: 'bg-red-100 text-red-700',      icon: XCircle,      dot: 'bg-red-400'    };
    case 'cancelled':  return { color: 'bg-gray-100 text-gray-600',    icon: XCircle,      dot: 'bg-gray-400'   };
    default:           return { color: 'bg-gray-100 text-gray-600',    icon: Clock,        dot: 'bg-gray-400'   };
  }
}

export default function PayoutsPage() {
  const [payouts, setPayouts]     = useState<PayoutRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [pages, setPages]         = useState(1);
  const [total, setTotal]         = useState(0);
  const [statusFilter, setStatusFilter] = useState<PayoutStatus | ''>('');
  const [expandedId, setExpandedId]    = useState<string | null>(null);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);

  // Summary stats
  const [stats, setStats] = useState({
    totalProcessed: 0,
    totalInFlight: 0,
    totalFailed: 0,
    count: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.getPayouts({
      page,
      limit: 20,
      ...(statusFilter ? { status: statusFilter } : {})
    });
    if (res.success && res.data) {
      setPayouts(res.data.payouts);
      setTotal(res.data.pagination.total);
      setPages(res.data.pagination.pages);

      // Compute summary from current page (for a full view, call without filter)
      const all = res.data.payouts;
      setStats({
        totalProcessed: all.filter(p => p.status === 'processed').reduce((s, p) => s + p.amountRupees, 0),
        totalInFlight:  all.filter(p => ['awaiting_approval','processing','queued','pending','on_hold'].includes(p.status)).reduce((s, p) => s + p.amountRupees, 0),
        totalFailed:    all.filter(p => ['failed','reversed','cancelled','rejected','expired'].includes(p.status)).reduce((s, p) => s + p.amountRupees, 0),
        count: res.data.pagination.total,
      });
    } else {
      toast.error(res.message || 'Failed to load payouts');
    }
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const approvePayout = async (payoutId: string) => {
    setApprovalLoading(payoutId);
    const res = await api.approvePayout(payoutId);
    setApprovalLoading(null);
    if (res.success) {
      toast.success('Payout approved and submitted.');
      load();
    } else {
      toast.error(res.message || 'Payout approval failed. Sign in again if MFA is no longer fresh.');
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payout History</h1>
          <p className="text-sm text-gray-500 mt-0.5">All counsellor payouts — track status, UTR, and history</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 mb-1">Total Payouts</p>
          <p className="text-2xl font-black text-gray-900">{stats.count}</p>
          <p className="text-xs text-gray-400 mt-0.5">all time</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-green-600 mb-1">Processed</p>
          <p className="text-2xl font-black text-green-700">{formatCurrency(stats.totalProcessed)}</p>
          <p className="text-xs text-gray-400 mt-0.5">successfully credited</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-blue-600 mb-1">In Flight</p>
          <p className="text-2xl font-black text-blue-700">{formatCurrency(stats.totalInFlight)}</p>
          <p className="text-xs text-gray-400 mt-0.5">processing / queued</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-red-500 mb-1">Failed</p>
          <p className="text-2xl font-black text-red-600">{formatCurrency(stats.totalFailed)}</p>
          <p className="text-xs text-gray-400 mt-0.5">failed / reversed</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <Filter size={15} className="text-gray-400" />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as PayoutStatus | ''); setPage(1); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="ml-auto text-xs text-gray-400">{total} payout{total !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-100">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-8 h-8 bg-gray-100 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-100 rounded w-40" />
                  <div className="h-3 bg-gray-100 rounded w-28" />
                </div>
                <div className="w-20 h-6 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : payouts.length === 0 ? (
          <div className="py-16 text-center">
            <Send size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm font-medium">No payouts found</p>
            <p className="text-gray-400 text-xs mt-1">
              {statusFilter ? `No payouts with status "${statusFilter}"` : 'No payouts have been initiated yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {payouts.map((p) => {
              const meta       = statusMeta(p.status);
              const StatusIcon = meta.icon;
              const isExpanded = expandedId === p._id;
              const name       = p.counsellor?.user
                ? `${p.counsellor.user.firstName} ${p.counsellor.user.lastName}`
                : 'Unknown';

              return (
                <div key={p._id}>
                  <div
                    className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : p._id)}
                  >
                    {/* Status dot */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${meta.dot}`} />

                    {/* Counsellor */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                      <p className="text-xs text-gray-400 truncate font-mono">{p.razorpayPayoutId || p.referenceId || p._id}</p>
                    </div>

                    {/* Amount */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(p.amountRupees)}</p>
                      <p className="text-xs text-gray-400">{formatDate(p.createdAt)}</p>
                    </div>

                    {/* Status badge */}
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize flex-shrink-0 ${meta.color}`}>
                      <StatusIcon size={11} />
                      {p.status.replace('_', ' ')}
                    </span>

                    {p.status === 'awaiting_approval' && (
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); approvePayout(p._id); }}
                        disabled={approvalLoading === p._id}
                        className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                      >
                        {approvalLoading === p._id ? 'Approving...' : 'Approve'}
                      </button>
                    )}

                    <ChevronDown
                      size={16}
                      className={`text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="bg-gray-50 border-t border-gray-100 px-5 py-4 grid grid-cols-2 gap-4 text-sm">
                      {/* Bank details */}
                      <div className="col-span-2 bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-4 text-white">
                        <div className="flex items-center gap-2 mb-3">
                          <Building2 size={14} className="text-slate-300" />
                          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Bank Account</span>
                        </div>
                        <p className="font-bold">{p.bankDetailsSnapshot?.accountHolderName || name}</p>
                        <div className="flex items-center justify-between mt-2">
                          <div>
                            <p className="text-xs text-slate-400">{p.bankDetailsSnapshot?.bankName}</p>
                            <p className="text-sm font-mono font-semibold text-slate-200 tracking-widest mt-0.5">
                              {p.bankDetailsSnapshot?.accountNumberMasked || '···'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 uppercase">IFSC</p>
                            <p className="text-xs font-mono font-semibold text-slate-200">{p.bankDetailsSnapshot?.ifscCode}</p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Reference ID</p>
                        <p className="font-mono text-xs text-gray-700 break-all">{p.referenceId || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">UTR (Bank Ref)</p>
                        <p className="font-mono text-xs text-gray-700">{p.utr || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Initiated by</p>
                        <p className="text-xs text-gray-700">
                          {p.initiatedBy ? `${p.initiatedBy.firstName} ${p.initiatedBy.lastName}` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Approved by</p>
                        <p className="text-xs text-gray-700">
                          {p.approvedBy ? `${p.approvedBy.firstName} ${p.approvedBy.lastName}` : 'Awaiting independent approval'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Last Webhook</p>
                        <p className="text-xs text-gray-700">{p.lastWebhookAt ? formatDate(p.lastWebhookAt) : 'Not received yet'}</p>
                      </div>
                      {p.notes && (
                        <div className="col-span-2">
                          <p className="text-xs text-gray-500 mb-0.5">Notes</p>
                          <p className="text-xs text-gray-700">{p.notes}</p>
                        </div>
                      )}
                      {p.failureReason && (
                        <div className="col-span-2 bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-xs font-semibold text-red-700 mb-0.5">Failure Reason</p>
                          <p className="text-xs text-red-600">{p.failureReason}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {page} of {pages} · {total} total</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
