import { Suspense } from 'react';
import { Spinner } from '@/components/ui';
import { LearnArticlesPage } from './LearnArticlesPage';

export default function LearnPage() {
  return (
    <Suspense fallback={<LearnPageLoading />}>
      <LearnArticlesPage />
    </Suspense>
  );
}

function LearnPageLoading() {
  return (
    <div className="page-container max-w-6xl">
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    </div>
  );
}
