'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HeartHandshake, X } from 'lucide-react';

const promptKey = 'wellbeing-check-prompt-v1';

export function WellbeingCheckPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(!window.localStorage.getItem(promptKey));
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = (value: 'dismissed' | 'started') => {
    try { window.localStorage.setItem(promptKey, value); } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return <section className="mb-6 rounded-2xl border border-primary-200 bg-primary-50 p-5 shadow-[0_14px_32px_-26px_rgba(45,122,92,0.5)] dark:border-primary-700 dark:bg-primary-900/50"><div className="flex gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-600 text-white dark:bg-primary-500"><HeartHandshake className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0 flex-1"><h2 className="font-black text-gray-950 dark:text-primary-50">Take a 2-minute wellbeing check</h2><p className="mt-1 text-sm leading-6 text-gray-600 dark:text-primary-100/75">A private check-in can help you decide what support feels right. Your answers are not saved.</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/wellbeing-check" onClick={() => dismiss('started')} className="inline-flex min-h-10 items-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-400">Start check-in</Link><button type="button" onClick={() => dismiss('dismissed')} className="min-h-10 px-2 text-sm font-bold text-primary-700 hover:text-primary-900 dark:text-primary-200 dark:hover:text-primary-50">Not now</button></div></div><button type="button" aria-label="Dismiss wellbeing check prompt" onClick={() => dismiss('dismissed')} className="shrink-0 text-primary-700 hover:text-primary-900 dark:text-primary-200 dark:hover:text-primary-50"><X className="h-5 w-5" /></button></div></section>;
}
