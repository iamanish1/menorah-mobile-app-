import { NextResponse } from 'next/server';
import { CHECKOUT_CALLBACK_COOKIE } from '@/lib/checkoutCallback';

export const runtime = 'nodejs';

// This endpoint has no payment side effect. It only shortens the lifetime of
// the HttpOnly relay cookie after the server has rendered the return page.
export async function POST() {
  const response = NextResponse.json({ success: true }, {
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });

  response.cookies.set({
    name: CHECKOUT_CALLBACK_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/checkout/return',
    maxAge: 0,
  });

  return response;
}
