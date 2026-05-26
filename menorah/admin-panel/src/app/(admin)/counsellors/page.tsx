'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, ChevronRight, RefreshCw, Copy, CheckCheck } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { formatDate, formatCurrency, getInitials } from '@/lib/utils';
import type { Counsellor } from '@/types';
import toast from 'react-hot-toast';

const STATUS_TABS = [
  { key: 'pending', label: 'Pending Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'all', label: 'All' }
];

function CounsellorsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [counsellors, setCounsellors] = useState<Counsellor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState(searchParams.get('status') || 'pending');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  // Modals
  const [rejectModal, setRejectModal] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' });
  const [blockModal, setBlockModal] = useState<{ open: boolean; id: string; name: string; isBlocked: boolean }>({ open: false, id: '', name: '', isBlocked: false });
  const [credModal, setCredModal] = useState<{ open: boolean; username: string; password: string }>({ open: false, username: '', password: '' });
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.getCounsellors({ status: activeTab, page, limit: 15, search: search || undefined });
    if (res.success && res.data) {
      setCounsellors(res.data.counsellors);
      setTotal(res.data.pagination.total);
      setPages(res.data.pagination.pages);
    }
    setLoading(false);
  }, [activeTab, page, search]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string, name: string) => {
    setActionLoading(id + '-approve');
    const res = await api.approveCounsellor(id);
    setActionLoading('');
    if (res.success && res.data) {
      toast.success(`${name} approved`);
      setCredModal({ open: true, username: res.data.username, password: res.data.password });
      load();
    } else {
      toast.error(res.message || 'Failed to approve');
    }
  };

  const handleReject = async () => {
    if (!reason.trim()) { toast.error('Please enter a rejection reason'); return; }
    setActionLoading(rejectModal.id + '-reject');
    const res = await api.rejectCounsellor(rejectModal.id, reason);
    setActionLoading('');
    if (res.success) {
      toast.success('Application rejected');
      setRejectModal({ open: false, id: '', name: '' });
      setReason('');
      load();
    } else {
      toast.error(res.message || 'Failed to reject');
    }
  };

  const handleGeneratePassword = async (id: string, name: string) => {
    setActionLoading(id + '-creds');
    const res = await api.generatePassword(id);
    setActionLoading('');
    if (res.success && res.data) {
      setCredModal({ open: true, username: res.data.username, password: res.data.password });
      load();
    } else {
      toast.error(res.message || 'Failed to generate credentials');
    }
  };

  const handleBlock = async () => {
    if (!reason.trim()) { toast.error('Please enter a reason'); return; }
    setActionLoading(blockModal.id + '-block');
    const res = blockModal.isBlocked
      ? await api.unblockCounsellor(blockModal.id)
      : await api.blockCounsellor(blockModal.id, reason);
    setActionLoading('');
    if (res.success) {
      toast.success(blockModal.isBlocked ? 'Counsellor unblocked' : 'Counsellor blocked');
      setBlockModal({ open: false, id: '', name: '', isBlocked: false });
      setReason('');
      load();
    } else {
      toast.error(res.message || 'Action failed');
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const getBadgeVariant = (c: Counsellor) => {
    if (!c.isActive && c.status === 'approved') return 'blocked';
    return c.status as 'pending' | 'approved' | 'rejected';
  };

  const getBadgeLabel = (c: Counsellor) => {
    if (!c.isActive && c.status === 'approved') return 'blocked';
    return c.status;
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
                  <Badge variant={getBadgeVariant(c)}>{getBadgeLabel(c)}</Badge>
                  <span className="text-xs text-gray-400">{formatDate(c.createdAt)}</span>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    {c.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(c.id, `${c.user?.firstName ?? ''} ${c.user?.lastName ?? ''}`)}
                          disabled={actionLoading === c.id + '-approve'}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
                        >
                          {actionLoading === c.id + '-approve' ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => { setRejectModal({ open: true, id: c.id, name: `${c.user?.firstName ?? ''} ${c.user?.lastName ?? ''}` }); setReason(''); }}
                          className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {c.status === 'approved' && c.isActive && (
                      <>
                        <button
                          onClick={() => handleGeneratePassword(c.id, `${c.user?.firstName ?? ''} ${c.user?.lastName ?? ''}`)}
                          disabled={actionLoading === c.id + '-creds'}
                          className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
                        >
                          {actionLoading === c.id + '-creds' ? '...' : 'Reset Password'}
                        </button>
                        <button
                          onClick={() => { setBlockModal({ open: true, id: c.id, name: `${c.user?.firstName ?? ''} ${c.user?.lastName ?? ''}`, isBlocked: false }); setReason(''); }}
                          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
                        >
                          Block
                        </button>
                      </>
                    )}
                    {c.status === 'approved' && !c.isActive && (
                      <button
                        onClick={() => { setBlockModal({ open: true, id: c.id, name: `${c.user.firstName} ${c.user.lastName}`, isBlocked: true }); setReason(''); }}
                        className="px-3 py-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Unblock
                      </button>
                    )}
                    <button
                      onClick={() => router.push(`/counsellors/${c.id}`)}
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

      {/* Reject Modal */}
      <Modal open={rejectModal.open} onClose={() => setRejectModal({ open: false, id: '', name: '' })} title={`Reject: ${rejectModal.name}`} size="sm">
        <div className="space-y-4">
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
            <button onClick={() => setRejectModal({ open: false, id: '', name: '' })} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleReject} disabled={!!actionLoading} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors">
              {actionLoading ? 'Rejecting...' : 'Confirm Reject'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Block/Unblock Modal */}
      <Modal open={blockModal.open} onClose={() => setBlockModal({ open: false, id: '', name: '', isBlocked: false })} title={blockModal.isBlocked ? `Unblock: ${blockModal.name}` : `Block: ${blockModal.name}`} size="sm">
        <div className="space-y-4">
          {blockModal.isBlocked ? (
            <p className="text-sm text-gray-600">Are you sure you want to unblock this counsellor? They will be able to receive bookings and log in again.</p>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Block Reason</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Reason for blocking..."
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setBlockModal({ open: false, id: '', name: '', isBlocked: false })} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleBlock} disabled={!!actionLoading} className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors text-white ${blockModal.isBlocked ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-800'}`}>
              {actionLoading ? '...' : blockModal.isBlocked ? 'Unblock' : 'Block Counsellor'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Credentials Modal */}
      <Modal open={credModal.open} onClose={() => setCredModal({ open: false, username: '', password: '' })} title="Counsellor Login Credentials" size="sm">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            Share these credentials with the counsellor. The password will not be shown again.
          </div>
          {[{ label: 'Username (Email)', value: credModal.username, key: 'user' }, { label: 'Password', value: credModal.password, key: 'pass' }].map(({ label, value, key }) => (
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
          <button onClick={() => setCredModal({ open: false, username: '', password: '' })} className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors mt-1">
            Done
          </button>
        </div>
      </Modal>
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
