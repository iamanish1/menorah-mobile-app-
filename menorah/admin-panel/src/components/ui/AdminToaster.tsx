'use client';

import { usePathname } from 'next/navigation';
import { Toaster } from 'react-hot-toast';

const AUTH_PATHS = new Set(['/login', '/verify-email']);

/**
 * react-hot-toast renders styled DOM nodes. Auth pages use a strict CSP that
 * forbids style attributes, so they use their inline status messages instead.
 */
export function AdminToaster() {
  const pathname = usePathname();
  if (AUTH_PATHS.has(pathname)) return null;

  return <Toaster position="top-right" toastOptions={{ duration: 4000 }} />;
}
