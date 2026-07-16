import { NextRequest, NextResponse } from 'next/server';

// Every route except /login is an admin-only route
const PUBLIC_ROUTES = ['/login'];

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
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('mn_admin_auth')?.value;
  const nonce = createNonce();
  const csp = buildCsp(nonce);

  const isPublic = PUBLIC_ROUTES.some((p) => pathname.startsWith(p));

  // All non-public routes require admin token
  if (!isPublic && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return withSecurityHeaders(NextResponse.redirect(loginUrl), csp);
  }

  // Authenticated admin hitting /login → dashboard
  if (isPublic && token) {
    return withSecurityHeaders(NextResponse.redirect(new URL('/', request.url)), csp);
  }

  return nextWithSecurityHeaders(request, nonce, csp);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
