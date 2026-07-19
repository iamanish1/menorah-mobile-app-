'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { IndianRupee, Send, ChevronDown, ExternalLink, Building2, CheckCircle2, AlertCircle } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import Modal from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, getInitials } from '@/lib/utils';
import type { RevenueData, CounsellorRevenue } from '@/types';
import toast from 'react-hot-toast';

const PERIOD_OPTIONS = [
  { key: 'monthly', label: 'This Month' },
  { key: 'weekly', label: 'This Week' },
  { key: 'today', label: 'Today' },
  { key: 'allTime', label: 'All Time' }
];

export default function RevenuePage() {
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [counsellors, setCounsellors] = useState<CounsellorRevenue[]>([]);
  const [loadingRevenue, setLoadingRevenue] = useState(true);
  const [loadingCounsellors, setLoadingCounsellors] = useState(true);
  const [period, setPeriod] = useState('monthly');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Payout modal
  const [payoutModal, setPayoutModal] = useState<{ open: boolean; counsellor: CounsellorRevenue | null }>({ open: false, counsellor: null });
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutResult, setPayoutResult] = useState<{ payoutRecordId: string; status: string; amount: number } | null>(null);

  // Revenue detail drawer
  const [selectedCounsellor, setSelectedCounsellor] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<unknown>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    api.getRevenue().then((res) => {
      if (res.success && res.data) setRevenue(res.data);
      setLoadingRevenue(false);
    });
  }, []);

  const loadCounsellors = useCallback(async () => {
    setLoadingCounsellors(true);
    const res = await api.getCounsellorRevenue({ period, page, limit: 15 });
    if (res.success && res.data) {
      setCounsellors(res.data.counsellors);
      setTotal(res.data.pagination.total);
      setPages(res.data.pagination.pages);
    }
    setLoadingCounsellors(false);
  }, [period, page]);

  useEffect(() => { loadCounsellors(); }, [loadCounsellors]);

  const openPayoutModal = (c: CounsellorRevenue) => {
    setPayoutModal({ open: true, counsellor: c });
    setPayoutAmount(String(Math.floor(c.counsellorEarnings)));
    setPayoutNotes('');
    setPayoutResult(null);
  };

  const handlePayout = async () => {
    const { counsellor } = payoutModal;
    if (!counsellor) return;
    const amountRupees = parseFloat(payoutAmount);
    if (isNaN(amountRupees) || amountRupees < 1) { toast.error('Enter a valid amount (min ₹1)'); return; }
    if (amountRupees > counsellor.counsellorEarnings) { toast.error('Amount exceeds counsellor earnings'); return; }
    if (!counsellor.bankDetails?.configured) { toast.error('Counsellor has no bank details on file'); return; }

    setPayoutLoading(true);
    const res = await api.initiatePayout(counsellor.counsellorId, Math.round(amountRupees * 100), payoutNotes);
    setPayoutLoading(false);

    if (res.success && res.data) {
      setPayoutResult(res.data);
      toast.success(`Payout request for ${formatCurrency(amountRupees)} created.`);
      loadCounsellors();
    } else {
      toast.error(res.message || 'Payout failed');
    }
  };

  const openDetail = async (counsellorId: string) => {
    if (selectedCounsellor === counsellorId) { setSelectedCounsellor(null); return; }
    setSelectedCounsellor(counsellorId);
    setDetailLoading(true);
    const res = await api.getCounsellorRevenueDetail(counsellorId);
    if (res.success) setDetailData(res.data);
    setDetailLoading(false);
  };

  const revenueChartData = revenue?.dailyTrend?.slice(-30) || [];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {loadingRevenue ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-white border border-gray-200 rounded-xl h-24 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard title="Today's Revenue" value={formatCurrency(revenue?.summary.today.revenue || 0)} subtitle={`${revenue?.summary.today.bookings || 0} bookings`} icon={IndianRupee} color="green" />
          <StatCard title="This Week" value={formatCurrency(revenue?.summary.weekly.revenue || 0)} subtitle={`${revenue?.summary.weekly.bookings || 0} bookings`} icon={IndianRupee} color="blue" />
          <StatCard title="This Month" value={formatCurrency(revenue?.summary.monthly.revenue || 0)} subtitle={`${revenue?.summary.monthly.bookings || 0} bookings`} icon={IndianRupee} color="purple" />
          <StatCard title="All Time" value={formatCurrency(revenue?.summary.allTime.revenue || 0)} subtitle={`${revenue?.summary.allTime.bookings || 0} total bookings`} icon={IndianRupee} color="amber" />
        </div>
      )}

      {/* Revenue Chart */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Revenue Trend (Last 30 Days)</h3>
        {revenueChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueChartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} labelFormatter={(l) => formatDate(l)} />
              <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.5} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">No revenue data yet</div>
        )}
      </div>

      {/* Counsellor revenue table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Counsellor Revenue</h3>
            <p className="text-xs text-gray-500 mt-0.5">{total} counsellors with earnings</p>
          </div>
          {/* Period selector */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => { setPeriod(opt.key); setPage(1); }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${period === opt.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loadingCounsellors ? (
          <div className="divide-y divide-gray-100">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-9 h-9 bg-gray-100 rounded-full" />
                <div className="flex-1 space-y-2"><div className="h-3.5 bg-gray-100 rounded w-32" /><div className="h-3 bg-gray-100 rounded w-24" /></div>
                <div className="w-20 h-6 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : counsellors.length === 0 ? (
          <div className="py-14 text-center text-gray-400 text-sm">No earnings data for this period.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {counsellors.map((c) => (
              <div key={c.counsellorId}>
                <div className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm flex-shrink-0">
                    {getInitials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-500 truncate">{c.specialization} · {c.sessions} sessions</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-gray-900">{formatCurrency(c.counsellorEarnings)}</p>
                    <p className="text-xs text-gray-400">net earnings</p>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-sm font-semibold text-green-600">{formatCurrency(c.revenue)}</p>
                    <p className="text-xs text-gray-400">gross · {c.commissionRate}% fee</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openPayoutModal(c)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Send size={12} /> Payout
                    </button>
                    <button
                      onClick={() => openDetail(c.counsellorId)}
                      className={`p-1.5 rounded-lg transition-colors ${selectedCounsellor === c.counsellorId ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
                    >
                      <ChevronDown size={16} className={`transition-transform ${selectedCounsellor === c.counsellorId ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Expanded detail row */}
                {selectedCounsellor === c.counsellorId && (
                  <div className="bg-gray-50 border-t border-gray-100 px-5 py-4">
                    {detailLoading ? (
                      <div className="h-16 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : detailData ? (
                      <div className="space-y-3">
                        {/* Monthly breakdown */}
                        {(detailData as { monthlyBreakdown?: { month: string; revenue: number; sessions: number; counsellorNet: number }[] }).monthlyBreakdown?.slice(0, 6).map((m) => (
                          <div key={m.month} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600 font-medium">{m.month}</span>
                            <span className="text-gray-500">{m.sessions} sessions</span>
                            <span className="font-semibold text-gray-900">{formatCurrency(m.counsellorNet)} net</span>
                          </div>
                        ))}
                        {/* Bank details */}
                        {c.bankDetails?.configured && (
                          <div className="pt-2 border-t border-gray-200 text-xs text-gray-500">
                            Bank: {c.bankDetails.bankName} · A/C: {c.bankDetails.accountNumberMasked} · IFSC: {c.bankDetails.ifscCode}
                          </div>
                        )}
                        {c.lastPayoutAt && (
                          <div className="text-xs text-gray-500">
                            Last payout: {formatCurrency(c.lastPayoutAmount || 0)} on {formatDate(c.lastPayoutAt)} · Total paid out: {formatCurrency(c.totalPaidOut || 0)}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {page} of {pages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* Payout Modal */}
      <Modal open={payoutModal.open} onClose={() => { setPayoutModal({ open: false, counsellor: null }); setPayoutResult(null); }} title="Request Payout" size="md">
        {payoutModal.counsellor && !payoutResult && (
          <div className="flex flex-col gap-4">

            {/* Counsellor header */}
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
                {getInitials(payoutModal.counsellor.name)}
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-gray-900 truncate">{payoutModal.counsellor.name}</p>
                <p className="text-xs text-gray-400 truncate">{payoutModal.counsellor.email}</p>
              </div>
              <div className="ml-auto text-right flex-shrink-0">
                <p className="text-xs text-gray-400">Net Earnings</p>
                <p className="text-lg font-black text-green-600">{formatCurrency(payoutModal.counsellor.counsellorEarnings)}</p>
              </div>
            </div>

            {/* Earnings breakdown */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Gross</p>
                <p className="text-sm font-bold text-gray-800 mt-0.5">{formatCurrency(payoutModal.counsellor.revenue)}</p>
              </div>
              <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 text-center">
                <p className="text-[10px] font-medium text-orange-400 uppercase tracking-wide">Platform</p>
                <p className="text-sm font-bold text-orange-700 mt-0.5">{formatCurrency(payoutModal.counsellor.platformFee)}</p>
                <p className="text-[10px] text-orange-400">{payoutModal.counsellor.commissionRate}% fee</p>
              </div>
              <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
                <p className="text-[10px] font-medium text-green-600 uppercase tracking-wide">Counsellor</p>
                <p className="text-sm font-bold text-green-700 mt-0.5">{formatCurrency(payoutModal.counsellor.counsellorEarnings)}</p>
              </div>
            </div>

            {/* Bank destination */}
            {payoutModal.counsellor.bankDetails?.configured ? (
              <div className="rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 p-4 text-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-slate-300" />
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Paying To</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-green-500/20 rounded-full px-2 py-0.5">
                    <CheckCircle2 size={11} className="text-green-400" />
                    <span className="text-[10px] font-semibold text-green-400">Verified</span>
                  </div>
                </div>
                <p className="text-base font-bold tracking-wide">{payoutModal.counsellor.bankDetails.accountHolderName || payoutModal.counsellor.name}</p>
                <div className="flex items-center justify-between mt-2">
                  <div>
                    <p className="text-xs text-slate-400">{payoutModal.counsellor.bankDetails.bankName}</p>
                    <p className="text-sm font-mono font-semibold text-slate-200 tracking-widest mt-0.5">
                      {payoutModal.counsellor.bankDetails.accountNumberMasked}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 uppercase">IFSC</p>
                    <p className="text-xs font-mono font-semibold text-slate-200">{payoutModal.counsellor.bankDetails.ifscCode}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
                <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">No Bank Account on File</p>
                  <p className="text-xs text-red-500 mt-0.5">Ask the counsellor to add their bank details from their profile settings before initiating a payout.</p>
                </div>
              </div>
            )}

            {payoutModal.counsellor.bankDetails?.configured && (
              <>
                {/* Amount + Notes */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Payout Amount (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">₹</span>
                      <input
                        type="number"
                        value={payoutAmount}
                        onChange={(e) => setPayoutAmount(e.target.value)}
                        min="1"
                        max={payoutModal.counsellor.counsellorEarnings}
                        className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        placeholder="0"
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Max {formatCurrency(payoutModal.counsellor.counsellorEarnings)}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reference Note</label>
                    <input
                      type="text"
                      value={payoutNotes}
                      onChange={(e) => setPayoutNotes(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                      placeholder="e.g. May 2026"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Optional</p>
                  </div>
                </div>

                {/* Warning */}
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                  <AlertCircle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    This creates a payout request. A different administrator must approve it with a fresh MFA session before Razorpay X can transfer funds.
                  </p>
                </div>

                {/* Actions — sticky footer */}
                <div className="sticky bottom-0 bg-white pt-2 pb-1 -mx-6 px-6 border-t border-gray-100 mt-2">
                  <div className="flex gap-2.5">
                    <button
                      onClick={() => setPayoutModal({ open: false, counsellor: null })}
                      className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePayout}
                      disabled={payoutLoading}
                      className="flex-[2] px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-60 transition-all shadow-md flex items-center justify-center gap-2"
                    >
                      {payoutLoading
                        ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing…</>
                        : <><Send size={14} /> Request {payoutAmount ? formatCurrency(parseFloat(payoutAmount) || 0) : 'Payout'}</>
                      }
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Success state */}
        {payoutResult && (
          <div className="text-center space-y-5 py-3">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mx-auto shadow-lg">
              <CheckCircle2 size={30} className="text-white" />
            </div>
            <div>
              <p className="text-xl font-black text-gray-900">Payout Request Created</p>
              <p className="text-2xl font-black text-green-600 mt-1">{formatCurrency(payoutResult.amount / 100)}</p>
              <p className="text-xs text-gray-400 mt-2">Request ID: <span className="font-mono font-semibold text-gray-600">{payoutResult.payoutRecordId}</span></p>
              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold capitalize ${payoutResult.status === 'processed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {payoutResult.status}
              </span>
            </div>
            <button
              onClick={() => { setPayoutModal({ open: false, counsellor: null }); setPayoutResult(null); }}
              className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm"
            >
              Done
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
