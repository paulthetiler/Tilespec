import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { workflowPreviewExposed } from './lib/operations/next-actions/flags';

// The clickable Supervisor Today prototype is a static copy under /preview/workflow.
// It is generated at build/dev time for Vercel Preview and local next dev only.
function syncWorkflowPreview() {
  const dest = path.join(process.cwd(), 'public', 'preview', 'workflow');
  if (!workflowPreviewExposed()) {
    // A prior local dev/preview run may have generated the public copy. Do not
    // carry it into a later production build from the same checkout.
    rmSync(dest, { recursive: true, force: true });
    return;
  }
  const src = path.join(process.cwd(), 'docs', 'redesign', 'prototype');
  if (!existsSync(src)) return;
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  // Relative scripts must resolve under /preview/workflow/ even when the review
  // link has no trailing slash.
  const indexPath = path.join(dest, 'index.html');
  const html = readFileSync(indexPath, 'utf8');
  if (!html.includes('<base ')) {
    writeFileSync(indexPath, html.replace('<head>', '<head>\n<base href="/preview/workflow/">'));
  }
}
syncWorkflowPreview();

const nextConfig: NextConfig = {
  // Authenticated acceptance uses a disposable backend and must not reuse the
  // production or public-browser suite's compiled modules and runtime cache.
  distDir: process.env.TILESPEC_E2E_OUTPUT === '1' ? '.next/e2e' : '.next',
  experimental: { serverActions: { bodySizeLimit: '4.4mb' } },
  // Commercial documents are rendered on the server with the PDF renderer loaded natively, and the
  // embedded brand fonts travel with the routes that print them.
  serverExternalPackages: ['@react-pdf/renderer'],
  outputFileTracingIncludes: {
    '/admin/contracts/[id]/accounts/**': ['./lib/documents/fonts/**'],
    '/shared/documents/[token]': ['./lib/documents/fonts/**'],
    '/subcontractors/**': ['./lib/documents/fonts/**'],
    '/admin/subcontractors/**': ['./lib/documents/fonts/**'],
    '/admin/documents/terms/pdf': ['./node_modules/pdfkit/js/standard-fonts/**', './docs/commercial-terms-and-conditions-draft.md'],
    '/admin/documents/health-safety/pdf': ['./node_modules/pdfkit/js/standard-fonts/**', './docs/health-and-safety-policy-draft.md'],
    '/admin/documents/risk-assessment/pdf': ['./node_modules/pdfkit/js/standard-fonts/**', './docs/rams-risk-assessment-template.md'],
    '/admin/documents/method-statement/pdf': ['./node_modules/pdfkit/js/standard-fonts/**', './docs/rams-method-statement-template.md'],
    '/admin/documents/coshh-register/pdf': ['./node_modules/pdfkit/js/standard-fonts/**', './docs/coshh-register-template.md'],
    '/admin/documents/coshh-assessment/pdf': ['./node_modules/pdfkit/js/standard-fonts/**', './docs/coshh-assessment-template.md'],
  },
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
      { source: '/shared/:path*', headers: [...headers, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      // The subcontractor portal: never cached, never indexed, and the link's secret never leaves in a referrer.
      ...['/subcontractors', '/subcontractors/:path*'].map(source => ({ source, headers: [...headers, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] })),
      { source: '/preview/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
};
export default nextConfig;
