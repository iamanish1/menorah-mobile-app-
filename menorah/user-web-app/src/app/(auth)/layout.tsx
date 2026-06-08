import Link from 'next/link';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-[var(--app-bg)] text-gray-950 dark:text-primary-50">
      {/* Left — editorial brand panel */}
      <div className="hidden lg:flex lg:w-[44%] bg-primary-900 flex-col justify-between p-14 relative overflow-hidden dark:bg-primary-950">
        {/* Decorative shapes — depth without decoration */}
        <div className="absolute -top-24 -right-24 w-[28rem] h-[28rem] rounded-full bg-primary-800/40 pointer-events-none" />
        <div className="absolute -bottom-20 -left-14 w-72 h-72 rounded-full bg-primary-700/25 pointer-events-none" />

        <Link href="/" className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden">
            <img src="/logo.png" alt="Menorah" className="w-full h-full object-cover" />
          </div>
          <span className="text-white font-semibold tracking-tight">Menorah Health</span>
        </Link>

        <div className="relative z-10">
          <p className="text-primary-400 text-[11px] font-semibold uppercase tracking-[0.16em] mb-5">
            Men&apos;s Mental Wellness
          </p>
          <h2 className="text-[2.4rem] font-bold text-white leading-[1.13] mb-8">
            Strength begins<br />with asking for help.
          </h2>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 mb-9">
            {[
              { value: '30+',   label: 'Expert Counsellors' },
              { value: '500+',  label: 'Hours Completed' },
              { value: '1000+', label: 'Positive Reviews' },
              { value: '24/7',  label: 'Always Available' },
            ].map(({ value, label }) => (
              <div key={label} className="bg-white/[0.07] rounded-xl px-4 py-3 border border-white/10">
                <p className="text-white text-xl font-bold leading-none mb-1">{value}</p>
                <p className="text-primary-300 text-[12px] font-medium">{label}</p>
              </div>
            ))}
          </div>

          <figure className="border-l-2 border-primary-500/60 pl-5">
            <blockquote>
              <p className="text-primary-100/80 text-[15px] leading-[1.7]">
                &ldquo;I carried that weight alone for years. Talking to my counsellor changed everything — I finally feel like myself again.&rdquo;
              </p>
            </blockquote>
            <figcaption className="mt-3 text-primary-400 text-sm font-medium">
              — Arjun S., Mumbai
            </figcaption>
          </figure>
        </div>

        <p className="relative z-10 text-primary-500 text-sm">
          &copy; {new Date().getFullYear()} Menorah Health. All rights reserved.
        </p>
      </div>

      {/* Right — form panel */}
      <div className="flex-1 flex flex-col bg-white relative dark:bg-primary-950">
        <div className="absolute right-5 top-5 z-20">
          <ThemeToggle />
        </div>
        {/* Mobile logo — only visible below lg */}
        <div className="px-8 pt-7 lg:hidden">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-8 h-8 rounded-2xl overflow-hidden">
              <img src="/logo.png" alt="Menorah" className="w-full h-full object-cover" />
            </div>
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
