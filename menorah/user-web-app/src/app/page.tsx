'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { KeyFeaturesJourneySection } from '@/components/landing/KeyFeaturesJourneySection';
import { FaqSection } from '@/components/landing/FaqSection';
import { MenorahHomeHero } from '@/components/landing/MenorahHomeHero';
import { SupportDirectoryPreviewSection } from '@/components/landing/SupportDirectoryPreviewSection';
import { SupportPathwaySection } from '@/components/landing/SupportPathwaySection';
import { WhatWeDoSection } from '@/components/landing/WhatWeDoSection';
import { MenorahFooter } from '@/components/site/MenorahFooter';
import { MenorahNavbar } from '@/components/site/MenorahNavbar';
import { Spinner } from '@/components/ui';

export default function HomePage() {
  const { isAuthed, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthed) {
      router.replace('/discover');
    }
  }, [isAuthed, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isAuthed) return null;

  return (
    <div data-menorah-landing-theme="source">
      <MenorahNavbar morphOnScroll />
      <MenorahHomeHero />
      <KeyFeaturesJourneySection />
      <SupportDirectoryPreviewSection />
      <SupportPathwaySection />
      <WhatWeDoSection />
      <FaqSection />
      <MenorahFooter />
    </div>
  );
}
