import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  // Authenticated acceptance uses a disposable backend and must not reuse the
  // production or public-browser suite's compiled modules and runtime cache.
  distDir: process.env.TILESPEC_E2E_OUTPUT === '1' ? '.next/e2e' : '.next',
  experimental: { serverActions: { bodySizeLimit: '4.4mb' } },
  async headers() {
    const headers = [
      { key: 'Cache-Control', value: 'private, no-store' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ];
    return ['/admin/:path*', '/login', '/auth/:path*'].map(source => ({ source, headers }));
  },
};
export default nextConfig;
