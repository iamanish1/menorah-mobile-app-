import { NextRequest, NextResponse } from 'next/server';

function createNonce() {
  return crypto.randomUUID().replace(/-/g, '');
}

function originFromUrl(value?: string) {
  try {
    return value ? new URL(value).origin : '';
  } catch {
    return '';
  }
}

function buildCsp(nonce: string, strictAuthStyles: boolean) {
  const apiOrigin = originFromUrl(process.env.NEXT_PUBLIC_API_URL);
  const socketOrigin = originFromUrl(process.env.NEXT_PUBLIC_SOCKET_URL);
  const isProd = process.env.NODE_ENV === 'production';
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(!isProd ? ["'unsafe-eval'", 'http:', 'https:'] : []),
  ];
  const connectSrc = [
    "'self'",
    apiOrigin,
    socketOrigin,
    'https://api-web.menorah.me',
    'wss://api-web.menorah.me',
    'https://calls.menorah.me',
    'wss://calls.menorah.me',
    ...(!isProd ? ['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*'] : []),
  ].filter(Boolean);

  return [
    "default-src 'self'",
    `script-src ${Array.from(new Set(scriptSrc)).join(' ')}`,
    strictAuthStyles ? "style-src-elem 'self'" : "style-src-elem 'self' 'unsafe-inline'",
    // Auth screens are class-only and can be locked down. Dashboard widgets
    // still have a small set of dynamic style attributes pending migration.
    strictAuthStyles ? "style-src-attr 'none'" : "style-src-attr 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https://res.cloudinary.com",
    `connect-src ${Array.from(new Set(connectSrc)).join(' ')}`,
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

function withSecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // Fixed literal policy on NextResponse, not user-controlled Express input.
  // nosemgrep: javascript.express.security.x-frame-options-misconfiguration.x-frame-options-misconfiguration
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  return response;
}

function nextWithSecurityHeaders(request: NextRequest, nonce: string, csp: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp);
}

export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname === '/login' || pathname === '/register' || pathname.startsWith('/verify-email');
  const csp = buildCsp(nonce, isAuthRoute);

  return nextWithSecurityHeaders(request, nonce, csp);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
