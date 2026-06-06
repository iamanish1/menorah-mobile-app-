import { NextRequest, NextResponse } from 'next/server';

// Every route except /login is an admin-only route
const PUBLIC_ROUTES = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('mn_admin_auth')?.value;

  const isPublic = PUBLIC_ROUTES.some((p) => pathname.startsWith(p));

  // All non-public routes require admin token
  if (!isPublic && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated admin hitting /login → dashboard
  if (isPublic && token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
