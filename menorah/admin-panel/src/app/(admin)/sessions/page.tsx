'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Link2, RefreshCw, Save, ShieldAlert, Video } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDateTime, statusColor } from '@/lib/utils';
import type { AdminBooking, CallProvider } from '@/types';

type SessionFilter = 'confirmed,in-progress' | 'completed' | 'all';

const filters: { label: string; value: SessionFilter }[] = [
  { label: 'Upcoming', value: 'confirmed,in-progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'All', value: 'all' },
];

const providerOptions: { label: string; value: Exclude<CallProvider, 'livekit'> }[] = [
  { label: 'VSee', value: 'vsee' },
  { label: 'Doxy.me', value: 'doxy' },
  { label: 'Zoom', value: 'zoom' },
  { label: 'Google Meet', value: 'google_meet' },
  { label: 'Microsoft Teams', value: 'teams' },
];

const labelize = (value?: string) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Not set';

const isExternalProvider = (value?: string): value is Exclude<CallProvider, 'livekit' | 'disabled'> =>
  providerOptions.some((option) => option.value === value);

const personName = (person?: { firstName?: string; lastName?: string; email?: string }) => {
  const fullName = `${person?.firstName || ''} ${person?.lastName || ''}`.trim();
  return fullName || person?.email || 'Unassigned';
};

export default function SessionsPage() {
  const [filter, setFilter] = useState<SessionFilter>('confirmed,in-progress');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    provider: 'vsee',
    externalProviderName: 'VSee',
    externalJoinUrl: '',
    externalHostUrl: '',
  });

  const selected = useMemo(
    () => bookings.find((booking) => booking.id === selectedId) || bookings[0],
    [bookings, selectedId]
  );

  const loadBookings = async (nextFilter = filter) => {
    setLoading(true);
    setMessage('');
    const response = await api.getBookings({
      status: nextFilter === 'all' ? undefined : nextFilter,
      limit: 50,
    });
    if (response.success && response.data) {
      setBookings(response.data.bookings);
      if (!selectedId && response.data.bookings[0]) setSelectedId(response.data.bookings[0].id);
    } else {
      setMessage(response.message || 'Unable to load sessions.');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadBookings(filter);
  }, [filter]);

  useEffect(() => {
    if (!selected) return;
    const selectedProvider = selected.videoCall?.provider;
    setForm({
      provider: isExternalProvider(selectedProvider)
        ? selectedProvider
        : 'vsee',
      externalProviderName: selected.videoCall?.externalProviderName || labelize(selectedProvider || 'vsee'),
      externalJoinUrl: selected.videoCall?.externalJoinUrl || '',
      externalHostUrl: selected.videoCall?.externalHostUrl || '',
    });
  }, [selected]);

  const saveLink = async () => {
    if (!selected) return;

    setSaving(true);
    setMessage('');
    const response = await api.updateBookingCallLink(selected.id, form);
    setSaving(false);

    if (response.success) {
      setMessage('External session link saved.');
      await loadBookings();
    } else {
      setMessage(response.message || 'Unable to save external session link.');
    }
  };

  const selectedIsDisabled = selected?.videoCall?.joinMode === 'disabled' || selected?.videoCall?.provider === 'disabled';
  const selectedIsExternal = selected?.videoCall?.joinMode === 'external_link' || isExternalProvider(selected?.videoCall?.provider);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="mt-1 text-sm text-gray-500">Monitor video call policy and configure approved external links.</p>
        </div>
        <button
          onClick={() => loadBookings()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
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

      {message ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
          {message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Session</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Policy</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-sm text-gray-500">Loading sessions...</td>
                  </tr>
                ) : bookings.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-sm text-gray-500">No sessions found.</td>
                  </tr>
                ) : bookings.map((booking) => {
                  const videoCall = booking.videoCall || {};
                  const isSelected = selected?.id === booking.id;
                  const user = booking.user;
                  const counsellor = booking.counsellor?.user;
                  return (
                    <tr
                      key={booking.id}
                      onClick={() => setSelectedId(booking.id)}
                      className={cn('cursor-pointer hover:bg-gray-50', isSelected && 'bg-blue-50/70')}
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-gray-900">{personName(user)}</div>
                        <div className="text-sm text-gray-500">{personName(counsellor)}</div>
                        <div className="mt-1 text-xs text-gray-400">{formatDateTime(booking.scheduledAt)}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">
                            {labelize(videoCall.provider)}
                          </span>
                          <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">
                            {videoCall.region || 'UNKNOWN'}
                          </span>
                        </div>
                        <p className="mt-2 max-w-xs text-xs text-gray-500">{videoCall.policyReason || 'Policy not evaluated yet'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-bold', statusColor(booking.status))}>
                          {labelize(booking.status)}
                        </span>
                        <p className="mt-2 text-xs text-gray-500">{labelize(videoCall.status)}</p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {videoCall.externalJoinUrl ? (
                          <a
                            href={videoCall.externalJoinUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center justify-end gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
                          >
                            Open
                            <ExternalLink size={14} />
                          </a>
                        ) : (
                          <span className="text-sm text-gray-400">Not set</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          {selected ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                  <Video size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Call Setup</h2>
                  <p className="text-sm text-gray-500">
                    {personName(selected.user)} with {personName(selected.counsellor?.user)}
                  </p>
                </div>
              </div>

              {selectedIsDisabled ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <div className="flex gap-3">
                    <ShieldAlert className="mt-0.5 flex-shrink-0 text-red-600" size={18} />
                    <p className="text-sm text-red-800">
                      Calling is disabled until this session region is verified.
                    </p>
                  </div>
                </div>
              ) : selectedIsExternal ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex gap-3">
                    <ShieldAlert className="mt-0.5 flex-shrink-0 text-amber-600" size={18} />
                    <p className="text-sm text-amber-800">
                      LiveKit is blocked for this session policy. Save an approved external provider link before the session starts.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
                  This session is eligible for in-app LiveKit calling.
                </div>
              )}

              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Provider</span>
                  <select
                    value={form.provider}
                    onChange={(event) => {
                      const provider = event.target.value;
                      setForm((current) => ({ ...current, provider, externalProviderName: labelize(provider) }));
                    }}
                    className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    {providerOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Display Name</span>
                  <input
                    value={form.externalProviderName}
                    onChange={(event) => setForm((current) => ({ ...current, externalProviderName: event.target.value }))}
                    className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="VSee"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Participant HTTPS Link</span>
                  <input
                    value={form.externalJoinUrl}
                    onChange={(event) => setForm((current) => ({ ...current, externalJoinUrl: event.target.value }))}
                    className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="https://"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Host HTTPS Link</span>
                  <input
                    value={form.externalHostUrl}
                    onChange={(event) => setForm((current) => ({ ...current, externalHostUrl: event.target.value }))}
                    className="mt-1 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="https://"
                  />
                </label>
              </div>

              <button
                onClick={saveLink}
                disabled={selectedIsDisabled || saving || !form.externalJoinUrl.trim()}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                Save Call Link
              </button>

              <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                <div className="mb-2 flex items-center gap-2 font-bold text-gray-900">
                  <Link2 size={16} />
                  Current Policy
                </div>
                <p>Mode: {labelize(selected.videoCall?.joinMode)}</p>
                <p>Provider: {labelize(selected.videoCall?.provider)}</p>
                <p>Region: {selected.videoCall?.region || 'UNKNOWN'}</p>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-gray-500">Select a session to configure its call link.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
