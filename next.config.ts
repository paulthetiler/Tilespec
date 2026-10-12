import type { NextConfig } from 'next';
import { readSeoConfig } from './lib/seo/config';
const seo = readSeoConfig();
const nextConfig: NextConfig = {
  trailingSlash: false,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'wxxxgqi56ekoi5vz.public.blob.vercel-storage.com' }],
  },
  experimental: { serverActions: { bodySizeLimit: '4.4mb' } },
  async redirects() {
    if (!seo.indexingEnabled || !seo.canonicalOrigin) return [];
    const host = new URL(seo.canonicalOrigin).hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [{
      source: '/:path*',
      missing: [{ type: 'host' as const, value: host }],
      destination: `${seo.canonicalOrigin}/:path*`,
      permanent: true,
    }];
  },
  async headers() {
    const headers = [
      { key: 'Cache-Control', value: 'private, no-store' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ];
    return [
      ...(!seo.indexingEnabled ? [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }] }] : []),
      ...['/admin/:path*', '/login', '/auth/:path*'].map(source => ({ source, headers: [...headers, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] })),
      { source: '/api/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};
export default nextConfig;

