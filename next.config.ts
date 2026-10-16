import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { workflowPreviewExposed } from './lib/operations/next-actions/flags';

// The clickable Supervisor Today prototype is a static copy under /preview/workflow.
// It is generated at build/dev time for Vercel Preview and local next dev only.
function syncWorkflowPreview() {
  const dest = path.join(process.cwd(), 'public', 'preview', 'workflow');
  if (!workflowPreviewExposed()) return;
  const src = path.join(process.cwd(), 'docs', 'redesign', 'prototype');
  if (!existsSync(src)) return;
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}
syncWorkflowPreview();

const nextConfig: NextConfig = {
  // Authenticated acceptance uses a disposable backend and must not reuse the
  // production or public-browser suite's compiled modules and runtime cache.
  distDir: process.env.TILESPEC_E2E_OUTPUT === '1' ? '.next/e2e' : '.next',
  experimental: { serverActions: { bodySizeLimit: '4.4mb' } },
  async rewrites() {
    return [
      { source: '/preview/workflow', destination: '/preview/workflow/index.html' },
      { source: '/preview/workflow/', destination: '/preview/workflow/index.html' },
    ];
  },
  async headers() {
    const headers = [
      { key: 'Cache-Control', value: 'private, no-store' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ];
    return [
      ...['/admin/:path*', '/login', '/auth/:path*'].map(source => ({ source, headers })),
      { source: '/preview/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
};
export default nextConfig;
