"use client";

import Image from "next/image";
import { useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";

const FADE_DURATION_MS = 200;
const HOME_READY_SELECTOR = "[data-menorah-home-ready]";
const READY_POLL_MS = 40;
const FALLBACK_HIDE_MS = 900;

export function SiteLoadingScreen() {
  const pathname = usePathname();

  if (pathname !== "/") {
    return null;
  }

  return <HomeLoadingScreen />;
}

function HomeLoadingScreen() {
  const [mounted, setMounted] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    let didFinish = false;
    let pollTimer = 0;
    let fallbackTimer = 0;
    let firstCheckTimer = 0;
    let removeTimer: number | undefined;
    const observer = new MutationObserver(() => {
      finishIfHomeReady();
    });

    const finish = () => {
      if (didFinish) {
        return;
      }

      didFinish = true;
      setReady(true);
      setLeaving(true);
      removeTimer = window.setTimeout(() => setMounted(false), FADE_DURATION_MS);
    };

    const finishIfHomeReady = () => {
      const homeReady = Boolean(document.querySelector(HOME_READY_SELECTOR));

      if (homeReady) {
        finish();
      }
    };

    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("readystatechange", finishIfHomeReady);
    window.addEventListener("load", finishIfHomeReady);
    pollTimer = window.setInterval(finishIfHomeReady, READY_POLL_MS);
    fallbackTimer = window.setTimeout(finish, FALLBACK_HIDE_MS);
    firstCheckTimer = window.setTimeout(finishIfHomeReady, 0);

    return () => {
      observer.disconnect();
      document.removeEventListener("readystatechange", finishIfHomeReady);
      window.removeEventListener("load", finishIfHomeReady);
      window.clearInterval(pollTimer);
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(firstCheckTimer);
      if (removeTimer) {
        window.clearTimeout(removeTimer);
      }
    };
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div
      role="status"
      aria-label="Loading Menorah"
      className={`site-loader-shell fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-background transition-opacity duration-300 ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div
        className={`site-loader-panel relative flex w-[min(54vw,260px)] flex-col items-center justify-center transition-opacity duration-150 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      >
        <Image
          src="/menorah-loader-logo.png"
          alt=""
          width={900}
          height={835}
          priority
          className="site-loader-logo h-auto w-full object-contain"
          onLoad={() => setReady(true)}
        />
        <span className="site-loader-progress mt-7 block h-1 w-[min(52vw,220px)] overflow-hidden rounded-full" />
      </div>
      <span className="sr-only">Loading Menorah</span>
    </div>
  );
}
