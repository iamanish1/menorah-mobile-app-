'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button, ToggleSwitch } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

export default function NotificationPrefsPage() {
  const { user, updateUser } = useAuth();
  const router = useRouter();
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.notificationPreferences) {
      setEmailEnabled(user.notificationPreferences.email ?? true);
    }
  }, [user]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError('');

    const res = await api.updateNotificationPreferences({ email: emailEnabled });
    if (res.success && res.data?.notificationPreferences && user) {
      updateUser({
        ...user,
        notificationPreferences: {
          ...user.notificationPreferences,
          ...res.data.notificationPreferences,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setError(res.message || 'Unable to save your email notification preference.');
    }
    setSaving(false);
  };

  return (
    <div className="page-container max-w-md">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Notification Preferences</h1>

      {saved && <div role="status" className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-4">Preferences saved!</div>}
      {error && <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">{error}</div>}

      <div className="card">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="font-medium text-gray-900 text-sm">Email Notifications</p>
            <p className="text-xs text-gray-500 mt-0.5">Booking confirmations, reminders, session updates</p>
          </div>
          <ToggleSwitch
            checked={emailEnabled}
            label="Email Notifications toggle"
            className="ml-4"
            onCheckedChange={setEmailEnabled}
          />
        </div>
      </div>

      <Button fullWidth size="lg" className="mt-6" loading={saving} onClick={save}>Save Preferences</Button>
    </div>
  );
}
