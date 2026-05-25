'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Star, Calendar, IndianRupee, CheckCircle, XCircle, Lock, Unlock, Key, BarChart2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { formatDate, formatCurrency, getInitials } from '@/lib/utils';
import type { Counsellor } from '@/types';
import toast from 'react-hot-toast';

interface BookingStats {
  overall: { total: number; confirmed: number; cancelled: number; completed: number; acceptRate: number; cancelRate: number };
  dailyStats: { date: string; total: number; confirmed: number; cancelled: number; completed: number }[];
}

export default function CounsellorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [counsellor, setCounsellor] = useState<Counsellor | null>(null);
  const [allStats, setAllStats] = useState<Record<string, unknown> | null>(null);
  const [bookingStats, setBookingStats] = useState<BookingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const [rejectModal, setRejectModal] = useState(false);
  const [blockModal, setBlockModal] = useState(false);
  const [credModal, setCredModal] = useState<{ open: boolean; username: string; password: string }>({ open: false, username: '', password: '' });
  const [reason, setReason] = useState('');

  const load = async () => {
    setLoading(true);
    const [detailRes, statsRes] = await Promise.all([
      api.getCounsellor(id),
      api.getCounsellorBookingStats(id, 14)
    ]);
    if (detailRes.success && detailRes.data) {
      setCounsellor(detailRes.data.counsellor as unknown as Counsellor);
      setAllStats(detailRes.data.bookingStats as Record<string, unknown>);
    }
    if (statsRes.success && statsRes.data) {
      setBookingStats(statsRes.data as unknown as BookingStats);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleApprove = async () => {
    if (!counsellor) return;
    setActionLoading('approve');
    const res = await api.approveCounsellor(counsellor.id || counsellor._id!);
    setActionLoading('');
    if (res.success) { toast.success('Counsellor approved'); load(); } else toast.error(res.message || 'Failed');
  };

  const handleReject = async () => {
    if (!reason.trim() || !counsellor) { toast.error('Reason required'); return; }
    setActionLoading('reject');
    const res = await api.rejectCounsellor(counsellor.id || counsellor._id!, reason);
    setActionLoading('');
    if (res.success) { toast.success('Rejected'); setRejectModal(false); setReason(''); load(); } else toast.error(res.message || 'Failed');
  };

  const handleGeneratePassword = async () => {
    if (!counsellor) return;
    setActionLoading('creds');
    const res = await api.generatePassword(counsellor.id || counsellor._id!);
    setActionLoading('');
    if (res.success && res.data) {
      setCredModal({ open: true, username: res.data.username, password: res.data.password });
      load();
    } else toast.error(res.message || 'Failed');
  };

  const handleBlockToggle = async () => {
    if (!counsellor) return;
    if (!counsellor.isActive && !reason.trim()) { toast.error('Reason required'); return; }
    setActionLoading('block');
    const cId = counsellor.id || counsellor._id!;
    const res = counsellor.isActive ? await api.blockCounsellor(cId, reason) : await api.unblockCounsellor(cId);
    setActionLoading('');
    if (res.success) {
      toast.success(counsellor.isActive ? 'Counsellor blocked' : 'Counsellor unblocked');
      setBlockModal(false);
      setReason('');
      load();
    } else toast.error(res.message || 'Failed');
  };

  if (loading || !counsellor) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 bg-gray-100 rounded animate-pulse" />
        <div className="bg-white border border-gray-200 rounded-xl h-48 animate-pulse" />
      </div>
    );
  }

  const isBlocked = counsellor.status === 'approved' && !counsellor.isActive;
  const todayStats = (allStats?.today as { total: number; completed: number; cancelled: number }) || { total: 0, completed: 0, cancelled: 0 };
  const monthStats = (allStats?.thisMonth as { total: number; revenue: number }) || { total: 0, revenue: 0 };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back + actions */}
      <div className="flex items-start justify-between gap-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm font-medium">
          <ArrowLeft size={16} /> Back to Counsellors
        </button>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {counsellor.status === 'pending' && (
            <>
              <button onClick={handleApprove} disabled={!!actionLoading} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors flex items-center gap-1.5">
                <CheckCircle size={15} /> {actionLoading === 'approve' ? 'Approving...' : 'Approve'}
              </button>
              <button onClick={() => { setRejectModal(true); setReason(''); }} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold rounded-xl">
                <span className="flex items-center gap-1.5"><XCircle size={15} /> Reject</span>
              </button>
            </>
          )}
          {counsellor.status === 'approved' && !isBlocked && (
            <>
              <button onClick={handleGeneratePassword} disabled={!!actionLoading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors flex items-center gap-1.5">
                <Key size={15} /> {actionLoading === 'creds' ? 'Generating...' : 'Generate Password'}
              </button>
              <button onClick={() => { setBlockModal(true); setReason(''); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl flex items-center gap-1.5">
                <Lock size={15} /> Block
              </button>
            </>
          )}
          {isBlocked && (
            <button onClick={() => { setBlockModal(true); setReason(''); }} className="px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-semibold rounded-xl flex items-center gap-1.5">
              <Unlock size={15} /> Unblock
            </button>
          )}
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xl flex-shrink-0">
            {getInitials(`${counsellor.user.firstName} ${counsellor.user.lastName}`)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900">{counsellor.user.firstName} {counsellor.user.lastName}</h2>
              <Badge variant={isBlocked ? 'blocked' : counsellor.status as 'pending' | 'approved' | 'rejected'}>
                {isBlocked ? 'blocked' : counsellor.status}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{counsellor.user.email} · {counsellor.user.phone}</p>
            <p className="text-sm text-gray-600 mt-1">{counsellor.specialization} · {counsellor.experience} years experience · License: {counsellor.licenseNumber}</p>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <span className="flex items-center gap-1 text-sm text-amber-600 font-medium">
                <Star size={14} fill="currentColor" /> {counsellor.rating?.toFixed(1) || '0.0'} ({counsellor.reviewCount || 0} reviews)
              </span>
              <span className="text-sm text-gray-500">{formatCurrency(counsellor.hourlyRate)}/hr</span>
              <span className="text-sm text-gray-500">Commission: {counsellor.commissionRate}%</span>
              <span className="text-sm text-gray-500">Joined: {formatDate(counsellor.createdAt)}</span>
            </div>
          </div>
        </div>

        {counsellor.approvedAt && (
          <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
            Approved by {counsellor.approvedBy?.firstName} {counsellor.approvedBy?.lastName} on {formatDate(counsellor.approvedAt)}
          </div>
        )}
        {isBlocked && counsellor.blockedReason && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <strong>Blocked:</strong> {counsellor.blockedReason} · {counsellor.blockedAt ? formatDate(counsellor.blockedAt) : ''}
          </div>
        )}
        {counsellor.rejectionReason && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            <strong>Rejection reason:</strong> {counsellor.rejectionReason}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Today Sessions', value: todayStats.total, icon: Calendar, color: 'text-blue-600 bg-blue-50' },
          { label: 'Month Sessions', value: monthStats.total, icon: BarChart2, color: 'text-purple-600 bg-purple-50' },
          { label: 'Accept Rate', value: `${bookingStats?.overall.acceptRate || 0}%`, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
          { label: 'Month Revenue', value: formatCurrency(monthStats.revenue || 0), icon: IndianRupee, color: 'text-amber-600 bg-amber-50' }
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.color}`}>
              <s.icon size={16} />
            </div>
            <div>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-lg font-bold text-gray-900">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Booking stats chart */}
      {bookingStats && bookingStats.dailyStats.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Booking Activity (Last 14 Days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bookingStats.dailyStats} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="confirmed" name="Confirmed" fill="#22c55e" radius={[3, 3, 0, 0]} stackId="a" />
              <Bar dataKey="completed" name="Completed" fill="#2563eb" radius={[3, 3, 0, 0]} stackId="b" />
              <Bar dataKey="cancelled" name="Cancelled" fill="#ef4444" radius={[3, 3, 0, 0]} stackId="c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bank details */}
      {counsellor.bankDetails?.accountNumber && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Bank Details</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Account Holder', counsellor.bankDetails.accountHolderName],
              ['Bank Name', counsellor.bankDetails.bankName],
              ['Account Number', counsellor.bankDetails.accountNumber],
              ['IFSC Code', counsellor.bankDetails.ifscCode]
            ].map(([label, value]) => value && (
              <div key={label}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="font-medium text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Reject Application" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Rejection Reason</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              placeholder="Explain why this application is being rejected..." />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setRejectModal(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleReject} disabled={!!actionLoading} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60">
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Block Reason</label>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
                placeholder="Reason for blocking..." />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setBlockModal(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleBlockToggle} disabled={!!actionLoading} className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 ${isBlocked ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-800'}`}>
              {actionLoading === 'block' ? '...' : isBlocked ? 'Unblock' : 'Block'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={credModal.open} onClose={() => setCredModal({ open: false, username: '', password: '' })} title="Credentials Generated" size="sm">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            Share these with the counsellor. Password shown only once.
          </div>
          {[{ label: 'Username', value: credModal.username }, { label: 'Password', value: credModal.password }].map(({ label, value }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                <code className="text-sm font-mono text-gray-800 break-all">{value}</code>
              </div>
            </div>
          ))}
          <button onClick={() => setCredModal({ open: false, username: '', password: '' })} className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold">Done</button>
        </div>
      </Modal>
    </div>
  );
}
