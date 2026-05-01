import type { NextConfig } from 'next';
import fs from 'fs';

// Resolve the true filesystem casing of the project root.
// On Windows, process.cwd() returns the path as typed in the terminal, which
// may differ in case from the real directory name (e.g. 'menorah' vs 'Menorah').
const canonicalRoot = fs.realpathSync(process.cwd());

// Best-effort: fix cwd so anything that reads it later gets the right casing.
try { if (process.cwd() !== canonicalRoot) process.chdir(canonicalRoot); } catch {}

/**
 * Inline webpack plugin that normalises every resolved module path under the
 * project root to use the canonical (real) casing.
 *
 * Why: webpack on Windows with a case-insensitive NTFS filesystem treats
 * 'C:\...\menorah\...\foo.js' and 'C:\...\Menorah\...\foo.js' as *different*
 * modules, producing two instances of every shared-runtime module (React
 * contexts, router contexts, etc.). That causes:
 *   - "multiple modules with names that only differ in casing" warnings
 *   - "invariant expected layout router to be mounted" runtime crash
 *
 * The afterResolve hook fires after webpack determines the absolute path of a
 * module — the last chance to normalise it before it becomes a module identifier.
 */
const CaseNormalizerPlugin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply(compiler: any) {
    const canonNorm = canonicalRoot.replace(/\\/g, '/');
    const canonNormLower = canonNorm.toLowerCase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    compiler.hooks.normalModuleFactory.tap('CaseNormalizerPlugin', (factory: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      factory.hooks.afterResolve.tap('CaseNormalizerPlugin', (resolveData: any) => {
        const res: string | undefined = resolveData.resource;
        if (!res) return;
        const resNorm = res.replace(/\\/g, '/');
        if (resNorm.toLowerCase().startsWith(canonNormLower) && !resNorm.startsWith(canonNorm)) {
          resolveData.resource = canonNorm + res.slice(canonicalRoot.length);
        }
      });
    });
  },
};

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: 'randomuser.me' },
      { protocol: 'http',  hostname: 'localhost' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_JITSI_DOMAIN: process.env.NEXT_PUBLIC_JITSI_DOMAIN,
  },
  webpack(config, { dev }) {
    if (dev) {
      config.cache = false;
    }
    config.plugins = [...(config.plugins ?? []), CaseNormalizerPlugin];
    return config;
  },
};

export default nextConfig;
