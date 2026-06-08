import type { Metadata } from "next";
import Script from "next/script";
import "../globals.css";

export const metadata: Metadata = {
  title: "Menorah | Mental Health for Men",
  description: "Menorah is a free mental health app for men."
};

const staleCacheResetScript = `
(function () {
  var resetKey = "menorah-stale-chunk-reset-2026-05-22";
  try {
    if (window.localStorage && window.localStorage.getItem(resetKey)) {
      return;
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (registrations) {
        registrations.forEach(function (registration) {
          registration.unregister();
        });
      });
    }
    if ("caches" in window) {
      caches.keys().then(function (keys) {
        keys.forEach(function (key) {
          caches.delete(key);
        });
      });
    }
    if (window.localStorage) {
      window.localStorage.setItem(resetKey, "1");
    }
  } catch (error) {}
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <Script id="stale-cache-reset" strategy="beforeInteractive">
          {staleCacheResetScript}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
