'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { KeyFeaturesJourneySection } from '@/components/landing/KeyFeaturesJourneySection';
import { MenorahHomeHero } from '@/components/landing/MenorahHomeHero';
import { SupportDirectoryPreviewSection } from '@/components/landing/SupportDirectoryPreviewSection';
import { SupportPathwaySection } from '@/components/landing/SupportPathwaySection';
import { WhatWeDoSection } from '@/components/landing/WhatWeDoSection';

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
        <div className="h-8 w-8 rounded-full border-2 border-menorah-cream border-t-menorah-olive animate-spin" />
      </div>
    );
  }

  if (isAuthed) return null;

  return (
    <div data-menorah-landing-theme="source">
      <MenorahHomeHero />
      <KeyFeaturesJourneySection />
      <SupportDirectoryPreviewSection />
      <SupportPathwaySection />
      <WhatWeDoSection />
    </div>
  );
}
