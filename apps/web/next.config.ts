import type { NextConfig } from 'next';
// @ts-expect-error — next-pwa has no bundled types
import withPWA from 'next-pwa';

const INTERNAL_API = process.env.INTERNAL_API_URL ?? 'http://localhost:3333';

const nextConfig: NextConfig = {
  turbopack: {},
  allowedDevOrigins: ['192.168.1.125', 'localhost'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${INTERNAL_API}/api/v1/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 24 * 60 * 60,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
})(nextConfig);
