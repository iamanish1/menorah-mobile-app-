import { NextRequest, NextResponse } from 'next/server';

// All dashboard routes require counsellor authentication
const PROTECTED_PREFIXES = ['/dashboard', '/bookings', '/chat', '/articles', '/profile', '/settings'];
const AUTH_ROUTES = ['/login', '/register'];

function getTokenRole(token?: string) {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized));
    const role = String(decoded.role || 'user').toLowerCase();
    return role === 'counselor' ? 'counsellor' : role;
  } catch {
    return null;
  }
}

function clearAuthCookie(response: NextResponse) {
  response.cookies.set('mn_counsellor_auth', '', { path: '/', maxAge: 0 });
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('mn_counsellor_auth')?.value;
  const tokenRole = getTokenRole(token);

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  if (token && tokenRole && tokenRole !== 'counsellor') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('account', tokenRole);
    return clearAuthCookie(NextResponse.redirect(loginUrl));
  }

  if (isProtected && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/bookings/:path*',
    '/chat/:path*',
    '/articles/:path*',
    '/profile/:path*',
    '/settings/:path*',
    '/login',
    '/register',
  ],
};
