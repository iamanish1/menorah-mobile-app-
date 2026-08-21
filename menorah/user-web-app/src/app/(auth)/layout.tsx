import type { Metadata } from 'next';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

const trustSignals = [
  { value: '01', label: 'Create your secure profile' },
  { value: '02', label: 'Verify your email privately' },
  { value: '03', label: 'Find support when ready' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-[var(--app-bg)] text-gray-950 dark:text-primary-50">
      {/* Left — onboarding brand panel */}
      <div className="relative hidden overflow-hidden bg-[#0b2a20] text-white lg:flex lg:w-[44%]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,#0b2a20_0%,#123a2d_52%,#092119_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.38),transparent)]" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-36 w-full bg-[linear-gradient(0deg,rgba(95,176,142,0.18),transparent)]" />

        <div className="relative z-10 flex min-h-screen w-full flex-col justify-between p-12 xl:p-14">
          <Link href="/" className="flex w-fit items-center gap-3 rounded-2xl px-1 py-1 transition hover:bg-white/5">
            <span className="relative h-10 w-10 overflow-hidden rounded-2xl bg-white shadow-[0_12px_32px_-20px_rgba(255,255,255,0.7)]">
              <img src="/logo.png" alt="Menorah" width={40} height={40} className="h-full w-full object-cover" />
            </span>
            <span>
              <span className="block text-sm font-black leading-tight tracking-tight">Menorah Health</span>
              <span className="block text-[11px] font-semibold text-primary-200/75">Private onboarding</span>
            </span>
          </Link>

          <div className="space-y-7">
            <div className="max-w-[34rem]">
              <p className="mb-4 text-[11px] font-black uppercase tracking-[0.2em] text-primary-300">
                Men&apos;s Mental Wellness
              </p>
              <h2 className="text-[clamp(2.35rem,3.5vw,4.2rem)] font-black leading-[0.98] tracking-tight">
                A private space for men to start feeling lighter.
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {trustSignals.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary-300">{item.value}</p>
                  <p className="mt-3 text-sm font-black leading-5 text-white">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="relative min-h-44 overflow-hidden rounded-[1.75rem] border border-primary-300/18 bg-[#f7fbf7] p-5 text-[#0b2a20] shadow-[0_24px_70px_-42px_rgba(0,0,0,0.8)]">
              <div className="max-w-[15rem]">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary-700">After signup</p>
                <h3 className="mt-2 text-2xl font-black leading-tight">A guided app tour waits inside.</h3>
                <p className="mt-3 text-sm font-medium leading-6 text-primary-900/70">
                  First-time users see friendly bubbles explaining Discover, Chat, Bookings, Articles, and Profile.
                </p>
              </div>
              <img
                src="/menorah-product-phone.png"
                alt="Menorah mobile app preview"
                width={210}
                height={292}
                className="absolute -bottom-20 -right-7 w-44 rotate-[4deg] drop-shadow-2xl xl:w-52"
              />
            </div>
          </div>

          <p className="text-sm font-semibold text-primary-100/52">
            &copy; {new Date().getFullYear()} Menorah Health. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right — form panel */}
      <div className="flex-1 flex flex-col bg-white relative dark:bg-primary-950">
        <div className="absolute right-5 top-5 z-20">
          <ThemeToggle />
        </div>
        {/* Mobile logo — only visible below lg */}
        <div className="px-8 pt-7 lg:hidden">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="relative h-8 w-8 overflow-hidden rounded-2xl">
              <img src="/logo.png" alt="Menorah" width={32} height={32} className="h-full w-full object-cover" />
            </span>
            <span className="text-gray-950 dark:text-primary-50 font-bold text-sm">Menorah Health</span>
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center px-8 py-12">
          <div className="w-full max-w-sm rounded-[1.75rem] border border-primary-100 bg-white/92 p-7 shadow-[0_18px_48px_-32px_rgba(45,122,92,0.5)] dark:border-primary-800 dark:bg-primary-900/80">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
