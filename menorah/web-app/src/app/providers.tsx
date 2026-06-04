'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Wrap all app pages with React Query.
 * QueryClient is created inside the component so Next.js doesn't share
 * a single instance across requests in SSR mode.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime:            60 * 1000,   // 1 min default stale time
            gcTime:               5 * 60 * 1000, // 5 min cache retention
            retry:                2,
            retryDelay:           (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
            refetchOnWindowFocus: false,         // counsellors keep browser tab open all day
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
