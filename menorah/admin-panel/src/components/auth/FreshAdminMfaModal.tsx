'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Modal from '@/components/ui/Modal';

interface FreshAdminMfaModalProps {
  open: boolean;
  onClose: () => void;
  onRefreshed: () => void;
}

export default function FreshAdminMfaModal({
  open,
  onClose,
  onRefreshed,
}: FreshAdminMfaModalProps) {
  const { user, login, completeMfa } = useAuth();
  const [password, setPassword] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setPassword('');
      setChallengeId('');
      setMfaCode('');
      setError('');
      setLoading(false);
    }
  }, [open]);

  const handleClose = () => {
    if (!loading) onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!user?.email) {
      setError('The current administrator session is unavailable.');
      return;
    }
    if (challengeId) {
      if (!/^\d{6}$/.test(mfaCode)) {
        setError('Enter the 6-digit verification code.');
        return;
      }
    } else if (!password) {
      setError('Enter your current password.');
      return;
    }

    setLoading(true);
    const result = challengeId
      ? await completeMfa(challengeId, mfaCode)
      : await login(user.email, password);
    setLoading(false);

    const loginResult = result as typeof result & {
      mfaRequired?: boolean;
      challengeId?: string;
    };
    if (loginResult.success && loginResult.mfaRequired && loginResult.challengeId) {
      setChallengeId(loginResult.challengeId);
      setPassword('');
      setMfaCode('');
      return;
    }
    if (!result.success) {
      setError(result.message || 'Multi-factor re-authentication failed.');
      return;
    }

    onRefreshed();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Refresh Administrator MFA" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
          <span className="flex items-center gap-2 font-semibold">
            <ShieldCheck size={16} /> Sensitive action
          </span>
          <p className="mt-1">
            Confirm your current password and emailed verification code. Your unsaved review
            details remain on this page; retry the action after verification succeeds.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Administrator</label>
          <input
            value={user?.email || ''}
            disabled
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
          />
        </div>

        {!challengeId ? (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Current password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Verification code</label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={loading}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="123456"
            />
          </div>
        )}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Verifying...' : challengeId ? 'Verify code' : 'Send code'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
