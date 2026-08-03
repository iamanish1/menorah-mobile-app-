import fs from 'node:fs';

// Resolve the true filesystem casing of the project root.
// On Windows, process.cwd() can differ in case from the real directory name.
const canonicalRoot = fs.realpathSync(process.cwd());

try {
  if (process.cwd() !== canonicalRoot) {
    process.chdir(canonicalRoot);
  }
} catch {}

const CaseNormalizerPlugin = {
  apply(compiler) {
    const canonNorm = canonicalRoot.replace(/\\/g, '/');
    const canonNormLower = canonNorm.toLowerCase();

    compiler.hooks.normalModuleFactory.tap('CaseNormalizerPlugin', (factory) => {
      factory.hooks.afterResolve.tap('CaseNormalizerPlugin', (resolveData) => {
        const res = resolveData.resource;
        if (!res) return;

        const resNorm = res.replace(/\\/g, '/');
        if (resNorm.toLowerCase().startsWith(canonNormLower) && !resNorm.startsWith(canonNorm)) {
          resolveData.resource = canonNorm + res.slice(canonicalRoot.length);
        }
      });
    });
  },
};

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: 'randomuser.me' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_JITSI_DOMAIN: process.env.NEXT_PUBLIC_JITSI_DOMAIN,
    NEXT_PUBLIC_CALLS_URL: process.env.NEXT_PUBLIC_CALLS_URL,
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
