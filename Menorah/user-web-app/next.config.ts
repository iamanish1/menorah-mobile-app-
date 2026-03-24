import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_JITSI_DOMAIN: process.env.NEXT_PUBLIC_JITSI_DOMAIN,
  },
  // Disable webpack's filesystem cache in development.
  // The cache serialiser allocates large ArrayBuffers which crash the dev process
  // on machines with limited RAM ("Array buffer allocation failed").
  webpack(config, { dev }) {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
