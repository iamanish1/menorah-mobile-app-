import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { Toaster } from 'react-hot-toast';

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
      <body>
        <AuthProvider>
          {children}
          <Toaster position="top-right" toastOptions={{ duration: 4000, style: { borderRadius: '10px', fontSize: '14px' } }} />
        </AuthProvider>
      </body>
    </html>
  );
}
