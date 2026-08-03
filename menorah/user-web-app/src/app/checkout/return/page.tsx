import { cookies } from 'next/headers';
import CheckoutReturnClient from './CheckoutReturnClient';
import { CHECKOUT_CALLBACK_COOKIE, decodeCheckoutCallback } from '@/lib/checkoutCallback';

// This route reads a short-lived HttpOnly cookie and therefore must never be
// statically cached with another visitor's payment proof.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CheckoutReturnPage() {
  const cookieStore = await cookies();
  const callback = decodeCheckoutCallback(cookieStore.get(CHECKOUT_CALLBACK_COOKIE)?.value);

  return <CheckoutReturnClient initialCallback={callback} />;
}
