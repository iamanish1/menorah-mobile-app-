'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CheckCircle, Instagram, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import SocialStudioTabs from '@/components/social-studio/SocialStudioTabs';
import Badge from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { InstagramAccount } from '@/types';

export default function InstagramSettingsPage() {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState('Menorah Health');
  const [igUserId, setIgUserId] = useState('');
  const [pageId, setPageId] = useState('');
  const [username, setUsername] = useState('');
  const [tokenExpiresAt, setTokenExpiresAt] = useState('');
  const [accessToken, setAccessToken] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const response = await api.getInstagramAccounts();
    if (response.success && response.data) setAccounts(response.data.accounts);
    else toast.error(response.message || 'Unable to load Instagram accounts');
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const response = await api.connectInstagramAccount({
      businessName,
      igUserId,
      pageId,
      username,
      accessToken,
      tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt).toISOString() : undefined
    });
    setSaving(false);
    if (response.success) {
      toast.success('Instagram account connected');
      setAccessToken('');
      load();
      return;
    }
    toast.error(response.message || 'Unable to connect account');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Instagram Account</h2>
        <p className="mt-0.5 text-sm text-gray-500">Configure the official Meta Instagram API account. Tokens are encrypted by the backend.</p>
      </div>
      <SocialStudioTabs />

      <div className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-pink-600"><Instagram size={20} /></div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Manual Connect</h3>
              <p className="text-xs text-gray-500">MVP setup for a business Instagram account.</p>
            </div>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Business name</span>
            <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Instagram user ID</span>
            <input value={igUserId} onChange={(event) => setIgUserId(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Facebook page ID</span>
            <input value={pageId} onChange={(event) => setPageId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Access token</span>
            <textarea value={accessToken} onChange={(event) => setAccessToken(event.target.value)} required rows={4} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-gray-400">This is sent once and never returned to the browser.</p>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Token expires at</span>
            <input type="datetime-local" value={tokenExpiresAt} onChange={(event) => setTokenExpiresAt(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            Connect Account
          </button>
        </form>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-5"><div className="h-64 animate-pulse rounded-xl bg-gray-100" /></div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Instagram size={36} className="text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-600">No Instagram account connected</p>
              <p className="mt-1 max-w-md text-xs leading-5 text-gray-400">Publishing stays disabled until a connected business account is configured and verified.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {accounts.map((account) => (
                <div key={account.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{account.businessName}</p>
                      <Badge variant={account.status === 'connected' ? 'approved' : account.status === 'expired' ? 'pending' : 'rejected'}>{account.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">@{account.username || 'unknown'} - IG ID {account.igUserId}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      Last verified {account.lastVerifiedAt ? formatDate(account.lastVerifiedAt) : 'never'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={async () => {
                      const response = await api.verifyInstagramAccount(account.id);
                      if (response.success) {
                        toast.success('Account verified');
                        load();
                      } else toast.error(response.message || 'Unable to verify account');
                    }} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                      <CheckCircle size={14} />
                      Verify
                    </button>
                    <button onClick={async () => {
                      const response = await api.disconnectInstagramAccount(account.id);
                      if (response.success) {
                        toast.success('Account disconnected');
                        load();
                      } else toast.error(response.message || 'Unable to disconnect account');
                    }} className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">
                      <Trash2 size={14} />
                      Disconnect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
