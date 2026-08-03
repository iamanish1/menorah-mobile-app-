import { NextRequest, NextResponse } from 'next/server';
import { readCallOrigins } from '../scripts/call-origin-policy.cjs';

const AUTH_ROUTES = ['/login', '/register', '/verify-otp', '/verify-email', '/forgot-password', '/reset-password', '/complete-profile'];
// Google Identity Services renders an iframe button only on these routes. It
// injects a stylesheet and adjusts iframe dimensions with style attributes, so
// keep the required inline-style exception route-scoped.
const GOOGLE_IDENTITY_ROUTES = ['/login', '/register', '/profile/security'];

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

function buildCsp(nonce: string, strictAuthStyles: boolean, usesGoogleIdentity: boolean) {
  const apiOrigin = originFromUrl(process.env.NEXT_PUBLIC_API_URL);
  const socketOrigin = originFromUrl(process.env.NEXT_PUBLIC_SOCKET_URL);
  const isProd = process.env.NODE_ENV === 'production';
  const callOrigins = readCallOrigins(process.env.NEXT_PUBLIC_CALLS_URL, {
    required: isProd,
  });
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    'https://accounts.google.com',
    'https://checkout.razorpay.com',
    'https://www.gstatic.com',
    ...(!isProd ? ["'unsafe-eval'", 'http:', 'https:'] : []),
  ];
  const connectSrc = [
    "'self'",
    apiOrigin,
    socketOrigin,
    ...callOrigins,
    ...(usesGoogleIdentity ? ['https://accounts.google.com/gsi/'] : []),
    ...(!isProd ? ['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*'] : []),
  ].filter(Boolean);
  const styleElementSrc = [
    "'self'",
    ...(usesGoogleIdentity ? ['https://accounts.google.com/gsi/style'] : []),
    // GIS creates its stylesheet asynchronously with an empty nonce. A nonce
    // source here would make CSP3 browsers ignore unsafe-inline, so the two
    // Google auth routes must allow inline style elements until GIS offers a
    // nonce-preserving renderer. All other auth routes stay strict.
    ...(!strictAuthStyles || usesGoogleIdentity ? ["'unsafe-inline'"] : []),
  ];
  // After removing Next Image from the auth layout, the remaining App Router
  // route-announcer style properties are assigned by the browser at runtime
  // and do not require a CSP attribute exception. GIS writes parser-visible
  // iframe styles, so retain the allowance only where its button is mounted.
  const styleAttrSrc = strictAuthStyles && !usesGoogleIdentity ? "'none'" : "'unsafe-inline'";

  return [
    "default-src 'self'",
    `script-src ${Array.from(new Set(scriptSrc)).join(' ')}`,
    `style-src-elem ${Array.from(new Set(styleElementSrc)).join(' ')}`,
    // The cross-origin Google button requires style attributes on its two auth
    // routes. Inline style elements stay disallowed on every other auth route.
    `style-src-attr ${styleAttrSrc}`,
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https://d8j0ntlcm91z4.cloudfront.net https://res.cloudinary.com",
    `connect-src ${Array.from(new Set(connectSrc)).join(' ')}`,
    `frame-src ${[
      ...(usesGoogleIdentity ? ['https://accounts.google.com/gsi/'] : []),
      'https://checkout.razorpay.com',
      'https://api.razorpay.com',
    ].join(' ')}`,
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

function noStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = createNonce();
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));
  const usesGoogleIdentity = GOOGLE_IDENTITY_ROUTES.includes(pathname);
  const csp = buildCsp(nonce, isAuthRoute, usesGoogleIdentity);

  const response = nextWithSecurityHeaders(request, nonce, csp);

  if (isAuthRoute) {
    return noStore(response);
  }

  if (pathname === '/checkout/callback' || pathname.startsWith('/checkout/return')) {
    // Payment proof is held in a short-lived HttpOnly cookie while this flow
    // runs. Do not retain a referring URL or cache either relay endpoint.
    response.headers.set('Referrer-Policy', 'no-referrer');
    return noStore(response);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
