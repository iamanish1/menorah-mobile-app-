import { NextRequest, NextResponse } from 'next/server';

// Routes that require authentication
const PROTECTED_PREFIXES = ['/discover', '/bookings', '/profile', '/chat', '/subscription', '/learn'];

// Routes accessible only when NOT authenticated
const AUTH_ROUTES = ['/login', '/register', '/verify-otp', '/verify-email', '/forgot-password', '/reset-password'];

function noStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('mn_auth')?.value;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  // Unauthenticated user trying to access protected route → login
  if (isProtected && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user trying to access auth routes → app
  if (isAuthRoute && token) {
    return noStore(NextResponse.redirect(new URL('/discover', request.url)));
  }

  const response = NextResponse.next();

  if (isAuthRoute) {
    return noStore(response);
  }

  return response;
}

export const config = {
  matcher: [
    '/discover/:path*',
    '/bookings/:path*',
    '/profile/:path*',
    '/chat/:path*',
    '/subscription/:path*',
    '/learn/:path*',
    '/login',
    '/register',
    '/verify-otp',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
  ],
};
