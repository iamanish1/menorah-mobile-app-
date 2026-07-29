"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const navLinks = [{ label: "Articles", href: "/articles" }];

export function MenorahNavbar({
  className,
  elevated = false,
  morphOnScroll = false
}: {
  className?: string;
  elevated?: boolean;
  morphOnScroll?: boolean;
}) {
  const [isFloating, setIsFloating] = useState(false);
  const showArticlesLink = !(morphOnScroll && isFloating);

  useEffect(() => {
    if (!morphOnScroll) {
      return;
    }

    let frame = 0;

    const updateNavbar = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setIsFloating(window.scrollY >= window.innerHeight * 0.75);
      });
    };

    updateNavbar();
    window.addEventListener("scroll", updateNavbar, { passive: true });
    window.addEventListener("resize", updateNavbar);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateNavbar);
      window.removeEventListener("resize", updateNavbar);
    };
  }, [morphOnScroll]);

  return (
    <header
      className={cn(
        "flex items-center justify-between font-body transition-all duration-500 ease-out motion-reduce:transition-none",
        morphOnScroll
          ? cn(
              "fixed left-1/2 z-[60] -translate-x-1/2 overflow-hidden border",
              isFloating
                ? "top-[clamp(0.75rem,1.4vw,1.35rem)] w-[min(calc(100vw_-_1rem),var(--landing-container))] rounded-full border-white/55 bg-background/45 px-[clamp(0.55rem,0.8vw,1rem)] py-[clamp(0.65rem,0.8vw,0.9rem)] shadow-[0_24px_90px_rgba(31,41,55,0.20)] backdrop-blur-[28px] backdrop-saturate-150"
                : "top-0 w-full max-w-[100vw] rounded-none border-transparent bg-transparent px-[var(--landing-page-x)] py-[clamp(1rem,1.4vw,1.55rem)]"
            )
          : cn(
              "relative z-10 px-[var(--landing-page-x)] py-[clamp(1rem,1.4vw,1.55rem)]",
              elevated && "border-b border-menorah-cream bg-menorah-page/95 backdrop-blur"
            ),
        className
      )}
    >
      {morphOnScroll && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500 motion-reduce:transition-none",
            isFloating && "opacity-100"
          )}
          aria-hidden="true"
        >
          <div className="absolute inset-0 rounded-[inherit] bg-[linear-gradient(135deg,rgba(255,255,255,0.62),rgba(255,255,255,0.18)_45%,rgba(255,255,255,0.40))]" />
          <div className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_10%_15%,rgba(255,255,255,0.92),transparent_28%),radial-gradient(circle_at_84%_18%,rgba(250,244,228,0.74),transparent_32%),radial-gradient(circle_at_50%_105%,rgba(37,74,48,0.10),transparent_38%)]" />
          <div className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/50" />
          <div className="absolute inset-x-5 top-0 h-px rounded-full bg-white/85" />
          <div className="absolute inset-x-12 bottom-0 h-px rounded-full bg-menorah-olive/10" />
        </div>
      )}

      <div className="relative z-10 flex w-full items-center justify-between gap-3">
        <Link
          href="/"
          className={cn(
            "flex min-w-0 items-center gap-3 font-semibold tracking-tight text-foreground transition-all duration-500 motion-reduce:transition-none",
            morphOnScroll && isFloating
              ? "text-[clamp(1rem,1.4vw,1.5rem)]"
              : "text-[clamp(1.15rem,1.35vw,1.55rem)]"
          )}
        >
          <Image
            src="/menorah-logo.png"
            alt="Menorah logo"
            width={52}
            height={52}
            priority
            className={cn(
              "shrink-0 rounded-full object-cover transition-all duration-500 motion-reduce:transition-none",
              morphOnScroll && isFloating
                ? "h-[clamp(2.35rem,2.8vw,3rem)] w-[clamp(2.35rem,2.8vw,3rem)]"
                : "h-[clamp(2.55rem,2.8vw,3.05rem)] w-[clamp(2.55rem,2.8vw,3.05rem)]"
            )}
          />
          <span className="truncate">Menorah</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-5">
          {showArticlesLink && (
            <>
              <nav className="hidden items-center gap-5 lg:flex" aria-label="Primary navigation">
                {navLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-base font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <Link
                href="/articles"
                className="hidden text-xs font-medium text-muted-foreground transition hover:text-foreground sm:inline-flex sm:text-sm lg:hidden"
              >
                Articles
              </Link>
            </>
          )}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="inline-flex min-h-[var(--landing-button-h)] items-center justify-center whitespace-nowrap rounded-full border border-primary px-[var(--landing-button-x)] py-2 text-[length:var(--landing-button-text)] font-medium text-foreground transition hover:bg-primary hover:text-primary-foreground"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-[var(--landing-button-h)] items-center justify-center whitespace-nowrap rounded-full bg-primary px-[var(--landing-button-x)] py-2 text-[length:var(--landing-button-text)] font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
