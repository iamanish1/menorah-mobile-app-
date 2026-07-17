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

function buildCsp(nonce: string) {
  const apiOrigin = originFromUrl(process.env.NEXT_PUBLIC_API_URL);
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
    'https://api-admin.menorah.me',
    ...(!isProd ? ['http://localhost:*', 'http://127.0.0.1:*'] : []),
  ].filter(Boolean);

  return [
    "default-src 'self'",
    `script-src ${Array.from(new Set(scriptSrc)).join(' ')}`,
    `style-src-elem 'self' 'nonce-${nonce}'`,
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://res.cloudinary.com",
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
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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
  const csp = buildCsp(nonce);

  return nextWithSecurityHeaders(request, nonce, csp);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
