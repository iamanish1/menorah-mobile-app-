import Link from 'next/link';
import { HeartPulse } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left — editorial brand panel */}
      <div className="hidden lg:flex lg:w-[44%] bg-primary-900 flex-col justify-between p-14 relative overflow-hidden">
        {/* Decorative shapes — depth without decoration */}
        <div className="absolute -top-24 -right-24 w-[28rem] h-[28rem] rounded-full bg-primary-800/40 pointer-events-none" />
        <div className="absolute -bottom-20 -left-14 w-72 h-72 rounded-full bg-primary-700/25 pointer-events-none" />

        <Link href="/" className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
            <HeartPulse className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-semibold tracking-tight">Menorah Health</span>
        </Link>

        <div className="relative z-10">
          <p className="text-primary-400 text-[11px] font-semibold uppercase tracking-[0.16em] mb-5">
            Mental Wellness Platform
          </p>
          <h2 className="text-[2.4rem] font-bold text-white leading-[1.13] mb-9">
            Support that fits<br />the way you live.
          </h2>
          <figure className="border-l-2 border-primary-500/60 pl-5">
            <blockquote>
              <p className="text-primary-100/80 text-[15px] leading-[1.7]">
                &ldquo;My counsellor understood exactly what I needed. Three months later, my anxiety is manageable for the first time.&rdquo;
              </p>
            </blockquote>
            <figcaption className="mt-3 text-primary-400 text-sm font-medium">
              — Priya M., Mumbai
            </figcaption>
          </figure>
        </div>

        <p className="relative z-10 text-primary-500 text-sm">
          &copy; {new Date().getFullYear()} Menorah Health. All rights reserved.
        </p>
      </div>

      {/* Right — form panel */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Mobile logo — only visible below lg */}
        <div className="px-8 pt-7 lg:hidden">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <HeartPulse className="w-4 h-4 text-white" />
            </div>
            <span className="text-gray-900 font-semibold text-sm">Menorah Health</span>
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center px-8 py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}
