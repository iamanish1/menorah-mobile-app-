'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

const TOUR_STORAGE_KEY = 'menorah-user-tour-v1';

type TourStep = {
  target: string;
  title: string;
  body: string;
};

type TourRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const desktopSteps: TourStep[] = [
  { target: 'discover', title: 'Discover counsellors', body: 'Browse available counsellors and open the right profile when you are ready.' },
  { target: 'bookings', title: 'Track bookings', body: 'See upcoming, completed, and payment-pending sessions in one place.' },
  { target: 'chat', title: 'Continue conversations', body: 'Open your counselling chats and keep the support thread easy to find.' },
  { target: 'subscription', title: 'Manage access', body: 'Review your plan and subscription details before booking care.' },
  { target: 'notifications', title: 'Stay updated', body: 'Important booking, article, and account updates appear here.' },
  { target: 'learn', title: 'Read articles', body: 'Use the article library for practical mental health guidance between sessions.' },
  { target: 'profile', title: 'Update profile', body: 'Edit your profile, account settings, support links, and privacy details.' },
  { target: 'theme', title: 'Switch theme', body: 'Move between light and dark mode whenever it feels easier on your eyes.' },
  { target: 'signout', title: 'Sign out safely', body: 'Use this when you are done, especially on shared devices.' },
];

const mobileSteps: TourStep[] = [
  { target: 'discover', title: 'Discover counsellors', body: 'Start here to find counsellors and open their profiles.' },
  { target: 'bookings', title: 'Track bookings', body: 'Your upcoming and past sessions stay in this tab.' },
  { target: 'chat', title: 'Continue conversations', body: 'Open counselling chats from the bottom bar.' },
  { target: 'notifications', title: 'Stay updated', body: 'Booking and account updates appear here.' },
  { target: 'learn', title: 'Read articles', body: 'Open practical mental health articles from the top bar.' },
  { target: 'profile', title: 'Update profile', body: 'Your profile, settings, and support links live here.' },
  { target: 'theme', title: 'Switch theme', body: 'Tap this to change between light and dark mode.' },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const isVisibleTarget = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
};

const findVisibleTarget = (id: string) => {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour-id="${id}"]`)).find(isVisibleTarget) ?? null;
};

const toTourRect = (rect: DOMRect): TourRect => ({
  top: rect.top,
  left: rect.left,
  right: rect.right,
  bottom: rect.bottom,
  width: rect.width,
  height: rect.height,
});

const getBubbleStyle = (rect: TourRect, viewport: { width: number; height: number }): CSSProperties => {
  const bubbleWidth = Math.min(320, viewport.width - 32);

  if (viewport.width < 1024) {
    const showAbove = rect.top > viewport.height / 2;
    return {
      width: bubbleWidth,
      left: clamp(rect.left + rect.width / 2 - bubbleWidth / 2, 16, viewport.width - bubbleWidth - 16),
      top: showAbove ? clamp(rect.top - 220, 16, viewport.height - 236) : clamp(rect.bottom + 14, 16, viewport.height - 236),
    };
  }

  return {
    width: bubbleWidth,
    left: clamp(rect.right + 18, 24, viewport.width - bubbleWidth - 24),
    top: clamp(rect.top - 12, 24, viewport.height - 244),
  };
};

export function FirstLoginTour() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TourRect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const steps = useMemo(() => (viewport.width >= 1024 ? desktopSteps : mobileSteps), [viewport.width]);
  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];
  const lastStep = stepIndex >= steps.length - 1;

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, new Date().toISOString());
    } catch {
      // If storage is unavailable, closing for this page view is still better than trapping the user.
    }
    setOpen(false);
  }, []);

  const updatePosition = useCallback(() => {
    if (!currentStep) return;
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    const target = findVisibleTarget(currentStep.target);
    setTargetRect(target ? toTourRect(target.getBoundingClientRect()) : null);
  }, [currentStep]);

  useEffect(() => {
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    try {
      if (window.localStorage.getItem(TOUR_STORAGE_KEY)) return;
    } catch {
      return;
    }

    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;

    document.documentElement.classList.add('menorah-tour-active');
    return () => document.documentElement.classList.remove('menorah-tour-active');
  }, [open]);

  useEffect(() => {
    if (!open) return;

    updatePosition();
    const refreshTimer = window.setTimeout(updatePosition, 350);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dismiss, open]);

  useEffect(() => {
    if (stepIndex >= steps.length) setStepIndex(steps.length - 1);
  }, [stepIndex, steps.length]);

  if (!open || !currentStep || !targetRect || viewport.width === 0) return null;

  const bubbleStyle = getBubbleStyle(targetRect, viewport);
  const highlightStyle: CSSProperties = {
    top: targetRect.top - 6,
    left: targetRect.left - 6,
    width: targetRect.width + 12,
    height: targetRect.height + 12,
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]" aria-live="polite">
      <div className="absolute inset-0 bg-gray-950/20 backdrop-blur-[1px]" />
      <div
        className="fixed rounded-[1.35rem] border-2 border-primary-300 bg-primary-200/15 shadow-[0_0_0_9999px_rgba(17,24,39,0.08),0_18px_50px_-30px_rgba(17,24,39,0.8)] transition-all duration-200"
        style={highlightStyle}
        aria-hidden="true"
      />

      <section
        role="dialog"
        aria-modal="false"
        aria-label="First login guide"
        className="pointer-events-auto fixed rounded-[1.5rem] border border-primary-100 bg-white p-4 shadow-[0_26px_80px_-34px_rgba(17,24,39,0.75)] animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200 dark:border-primary-800 dark:bg-primary-950"
        style={bubbleStyle}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary-600 dark:text-primary-100/65">
              {stepIndex + 1} of {steps.length}
            </p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-gray-950 dark:text-primary-50">{currentStep.title}</h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-primary-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-100/55 dark:hover:bg-primary-900 dark:hover:text-primary-50"
            aria-label="Skip guide"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm leading-6 text-gray-600 dark:text-primary-100/72">{currentStep.body}</p>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-primary-50 dark:bg-primary-900">
          <div
            className="h-full rounded-full bg-primary-600 transition-all duration-300 dark:bg-primary-300"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
            Skip
          </Button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
                className="px-3"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (lastStep) dismiss();
                else setStepIndex((value) => value + 1);
              }}
              className={cn(lastStep && 'bg-primary-700 hover:bg-primary-800')}
            >
              {lastStep ? (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Done
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
