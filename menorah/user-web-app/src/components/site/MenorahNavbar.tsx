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
                ? "top-4 w-[calc(100%-1rem)] max-w-6xl rounded-full border-white/55 bg-background/45 px-2.5 py-3 shadow-[0_24px_90px_rgba(31,41,55,0.20)] backdrop-blur-[28px] backdrop-saturate-150 sm:top-5 sm:w-[calc(100%-3rem)] sm:px-3 md:px-3 lg:px-3 xl:px-4"
                : "top-0 w-full max-w-[100vw] rounded-none border-transparent bg-transparent px-6 py-5 md:px-12 lg:px-20"
            )
          : cn(
              "relative z-10 px-6 py-5 md:px-12 lg:px-20",
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
            morphOnScroll && isFloating ? "text-base sm:text-2xl" : "text-xl sm:text-2xl"
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
              morphOnScroll && isFloating ? "h-10 w-10 sm:h-12 sm:w-12" : "h-11 w-11 sm:h-12 sm:w-12"
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
                className="inline-flex text-xs font-medium text-muted-foreground transition hover:text-foreground sm:text-sm lg:hidden"
              >
                Articles
              </Link>
            </>
          )}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-full border border-primary px-3 py-2 text-xs font-medium text-foreground transition hover:bg-primary hover:text-primary-foreground sm:min-h-11 sm:px-5 sm:text-base"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-full bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 sm:min-h-11 sm:px-6 sm:text-base"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
