'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, Shield } from 'lucide-react';

export default function LoginPage() {
  const { login, completeMfa, user, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isLoading && user) router.replace('/dashboard');
  }, [isLoading, router, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (challengeId) {
      if (!/^\d{6}$/.test(mfaCode)) { setError('Enter the 6-digit verification code.'); return; }
    } else if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    const res = challengeId
      ? await completeMfa(challengeId, mfaCode)
      : await login(email, password);
    setLoading(false);

    const maybeMfa = res as typeof res & {
      mfaRequired?: boolean;
      challengeId?: string;
      needsVerification?: boolean;
      email?: string;
    };
    if (maybeMfa.needsVerification) {
      router.replace(`/verify-email?email=${encodeURIComponent(maybeMfa.email || email)}`);
      return;
    }
    if (maybeMfa.success && maybeMfa.mfaRequired && maybeMfa.challengeId) {
      setChallengeId(maybeMfa.challengeId);
      setPassword('');
      setMfaCode('');
      setNotice('Verification code sent. Enter it below to continue.');
      return;
    }

    if (res.success) {
      router.replace('/dashboard');
    } else {
      setError(res.message || 'Login failed');
    }
  };

  if (isLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 flex-col items-center justify-center p-12">
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-bold text-3xl mb-6">M</div>
        <h1 className="text-3xl font-bold text-white text-center">Menorah Health</h1>
        <p className="text-slate-400 text-center mt-3 max-w-xs leading-relaxed">
          Admin control panel — manage counsellors, monitor platform health, and disburse payouts.
        </p>
        <div className="mt-12 grid grid-cols-2 gap-4 w-full max-w-xs">
          {[
            { label: 'Counsellor Approvals', desc: 'Review and approve applications' },
            { label: 'Revenue Tracking', desc: 'Monitor platform earnings' },
            { label: 'User Analytics', desc: 'Track growth metrics' },
            { label: 'Payout Management', desc: 'Disburse via Razorpay X' }
          ].map((f) => (
            <div key={f.label} className="bg-slate-800 rounded-xl p-4">
              <p className="text-white text-sm font-medium">{f.label}</p>
              <p className="text-slate-400 text-xs mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-surface">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8 lg:hidden">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-2xl">M</div>
          </div>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Shield size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Admin Login</h2>
              <p className="text-sm text-gray-500">Restricted access</p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-xl px-4 py-3 mb-5">
              {notice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                disabled={Boolean(challengeId)}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@menorahhealth.app"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  disabled={Boolean(challengeId)}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 pr-11 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {challengeId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</>
              ) : challengeId ? 'Verify Code' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Menorah Health Admin Panel · Access restricted
          </p>
        </div>
      </div>
    </div>
  );
}
