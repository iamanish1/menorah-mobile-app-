'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { IndianRupee, Send, ChevronDown, ExternalLink } from 'lucide-react';
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
  const [payoutResult, setPayoutResult] = useState<{ payoutId: string; status: string; amount: number } | null>(null);

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
    if (!counsellor.bankDetails?.accountNumber) { toast.error('Counsellor has no bank details on file'); return; }

    setPayoutLoading(true);
    const res = await api.initiatePayout(counsellor.counsellorId, Math.round(amountRupees * 100), payoutNotes);
    setPayoutLoading(false);

    if (res.success && res.data) {
      setPayoutResult(res.data);
      toast.success(`Payout of ${formatCurrency(amountRupees)} initiated!`);
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
                        {c.bankDetails?.accountNumber && (
                          <div className="pt-2 border-t border-gray-200 text-xs text-gray-500">
                            Bank: {c.bankDetails.bankName} · A/C: ···{c.bankDetails.accountNumber.slice(-4)} · IFSC: {c.bankDetails.ifscCode}
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
      <Modal open={payoutModal.open} onClose={() => { setPayoutModal({ open: false, counsellor: null }); setPayoutResult(null); }} title="Initiate Payout" size="md">
        {payoutModal.counsellor && !payoutResult && (
          <div className="space-y-5">
            {/* Counsellor info */}
            <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm">
                {getInitials(payoutModal.counsellor.name)}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{payoutModal.counsellor.name}</p>
                <p className="text-xs text-gray-500">{payoutModal.counsellor.email}</p>
              </div>
            </div>

            {/* Earnings breakdown */}
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Gross Revenue', value: formatCurrency(payoutModal.counsellor.revenue) },
                { label: 'Platform Fee', value: formatCurrency(payoutModal.counsellor.platformFee), sub: `${payoutModal.counsellor.commissionRate}%` },
                { label: 'Net Earnings', value: formatCurrency(payoutModal.counsellor.counsellorEarnings), highlight: true }
              ].map((item) => (
                <div key={item.label} className={`rounded-xl p-3 border ${item.highlight ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                  <p className={`text-xs font-medium ${item.highlight ? 'text-green-700' : 'text-gray-500'}`}>{item.label}</p>
                  <p className={`text-base font-bold mt-0.5 ${item.highlight ? 'text-green-700' : 'text-gray-900'}`}>{item.value}</p>
                  {item.sub && <p className="text-xs text-gray-400">{item.sub}</p>}
                </div>
              ))}
            </div>

            {/* Bank details check */}
            {payoutModal.counsellor.bankDetails?.accountNumber ? (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
                Paying to: <strong>{payoutModal.counsellor.bankDetails.bankName}</strong> · A/C ···{payoutModal.counsellor.bankDetails.accountNumber.slice(-4)} · IFSC {payoutModal.counsellor.bankDetails.ifscCode}
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                No bank details on file. Ask the counsellor to update their profile.
              </div>
            )}

            {payoutModal.counsellor.bankDetails?.accountNumber && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Payout Amount (₹)</label>
                  <input
                    type="number"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    min="1"
                    max={payoutModal.counsellor.counsellorEarnings}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter amount in rupees"
                  />
                  <p className="text-xs text-gray-400 mt-1">Max: {formatCurrency(payoutModal.counsellor.counsellorEarnings)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
                  <input
                    type="text"
                    value={payoutNotes}
                    onChange={(e) => setPayoutNotes(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. April 2026 earnings"
                  />
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                  This will initiate a real bank transfer via Razorpay X. Ensure Razorpay X (Payout API) is activated on your account before proceeding.
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setPayoutModal({ open: false, counsellor: null })} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button onClick={handlePayout} disabled={payoutLoading} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                    {payoutLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</> : <><Send size={14} /> Initiate Payout</>}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {payoutResult && (
          <div className="text-center space-y-4 py-2">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <Send size={24} className="text-green-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">Payout Initiated!</p>
              <p className="text-sm text-gray-500 mt-1">{formatCurrency(payoutResult.amount)} sent</p>
              <p className="text-xs text-gray-400 mt-1">Payout ID: {payoutResult.payoutId}</p>
              <p className="text-xs font-medium mt-1 capitalize text-blue-600">Status: {payoutResult.status}</p>
            </div>
            <button onClick={() => { setPayoutModal({ open: false, counsellor: null }); setPayoutResult(null); }} className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold">Done</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
