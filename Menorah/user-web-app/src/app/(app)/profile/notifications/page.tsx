'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

interface Prefs { email: boolean; sms: boolean; push: boolean; }

export default function NotificationPrefsPage() {
  const { user, updateUser } = useAuth();
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>({ email: true, sms: true, push: true });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    if (user?.notificationPreferences) {
      setPrefs({
        email: user.notificationPreferences.email ?? true,
        sms:   user.notificationPreferences.sms   ?? true,
        push:  user.notificationPreferences.push  ?? true,
      });
    }
  }, [user]);

  const toggle = (key: keyof Prefs) => setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const save = async () => {
    setSaving(true);
    const res = await api.updateNotificationPreferences(prefs);
    if (res.success && res.data?.user) {
      updateUser(res.data.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const items: { key: keyof Prefs; label: string; desc: string }[] = [
    { key: 'email', label: 'Email Notifications', desc: 'Booking confirmations, reminders, session updates' },
    { key: 'sms',   label: 'SMS Notifications',   desc: 'Verification codes, urgent session reminders' },
    { key: 'push',  label: 'Push Notifications',  desc: 'Real-time alerts when using the app' },
  ];

  return (
    <div className="page-container max-w-md">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Notification Preferences</h1>

      {saved && <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-4">Preferences saved!</div>}

      <div className="card divide-y divide-gray-50">
        {items.map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="font-medium text-gray-900 text-sm">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
            <button
              onClick={() => toggle(key)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-4
                ${prefs[key] ? 'bg-primary-600' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
                ${prefs[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        ))}
      </div>

      <Button fullWidth size="lg" className="mt-6" loading={saving} onClick={save}>Save Preferences</Button>
    </div>
  );
}
