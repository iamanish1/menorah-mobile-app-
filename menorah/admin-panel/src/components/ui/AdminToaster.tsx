'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const AUTH_PATHS = new Set(['/login', '/verify-email']);

// Importing react-hot-toast itself injects goober <style> elements as a module
// side effect. Keep that module out of the auth-page client bundle: auth pages
// intentionally use strict, class-only style CSP and render their status
// messages locally instead.
const Toaster = dynamic(
  () => import('react-hot-toast').then(({ Toaster: ReactHotToast }) => ReactHotToast),
  { ssr: false },
);

/**
 * react-hot-toast renders styled DOM nodes. Auth pages use a strict CSP that
 * forbids style attributes, so they use their inline status messages instead.
 */
export function AdminToaster() {
  const pathname = usePathname();
  if (AUTH_PATHS.has(pathname)) return null;

  return <Toaster position="top-right" toastOptions={{ duration: 4000 }} />;
}
