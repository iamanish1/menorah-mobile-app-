'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui';

function Forwarder(): React.ReactElement {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const email = params.get('email') ?? '';
    router.replace(`/verify-otp?email=${encodeURIComponent(email)}`);
  }, [params, router]);

  return (
    <div className="flex items-center justify-center py-20">
      <Spinner size="lg" />
    </div>
  );
}

export default function VerifyEmailLegacy(): React.ReactElement {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>}>
      <Forwarder />
    </Suspense>
  );
}
