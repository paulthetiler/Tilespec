import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/seo-browser",
  fullyParallel: false,
  workers: 2,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  outputDir: "test-results/seo-traces",
  reporter: [["list"], ["html", { outputFolder: "playwright-report-seo", open: "never" }]],
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:3104",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "narrow", use: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3104",
    url: "http://127.0.0.1:3104",
    timeout: 120_000,
    reuseExistingServer: false,
    // CI must build with the same preview environment before this suite starts.
    env: { VERCEL_ENV: "preview", SEO_PRODUCTION_INDEXING: "false", SEO_CANONICAL_ORIGIN: "https://tilespec.uk" },
  },
});
