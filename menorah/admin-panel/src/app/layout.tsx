import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { AdminToaster } from '@/components/ui/AdminToaster';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Menorah Health — Admin Panel',
  description: 'Admin control panel for Menorah Health platform'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en">
      <head>
        {nonce ? <meta name="csp-nonce" content={nonce} /> : null}
      </head>
      <body className={inter.variable}>
        <AuthProvider>
          {children}
          <AdminToaster />
        </AuthProvider>
      </body>
    </html>
  );
}
