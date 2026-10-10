import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
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
