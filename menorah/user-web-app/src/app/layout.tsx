import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import './landing-effects.css';
import { Providers } from './providers';
import { SiteLoadingScreen } from '@/components/site/SiteLoadingScreen';
import { getPublicWebBaseUrl, SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(getPublicWebBaseUrl()),
  title: {
    default: 'Menorah Health | Free Mental Health Support for Men in India',
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'Menorah is a free mental health platform for men in India, with private support, counsellor access, articles, and practical tools for stress, burnout, anxiety, relationships, and help-seeking.',
  applicationName: SITE_NAME,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Menorah Health | Free Mental Health Support for Men in India',
    description:
      'Private mental health support, counsellor access, and practical articles for Indian men navigating stress, burnout, anxiety, relationships, and emotional wellbeing.',
    url: '/',
    siteName: SITE_NAME,
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Menorah Health | Free Mental Health Support for Men in India',
    description:
      'Private support, counsellor access, and practical mental-health articles for men in India.',
  },
  icons: { icon: '/favicon.ico' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {nonce ? <meta name="csp-nonce" content={nonce} /> : null}
      </head>
      <body>
        <SiteLoadingScreen />
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const stored = localStorage.getItem('menorah-theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (stored === 'dark' || (!stored && prefersDark)) {
                  document.documentElement.classList.add('dark');
                }
              } catch {}
            `,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
