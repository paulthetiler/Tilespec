import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3103",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3103",
    url: "http://127.0.0.1:3103/login",
    timeout: 120000,
    reuseExistingServer: false,
    // Boundary regression explicitly uses an unconfigured backend. Authenticated
    // staging acceptance is a separate suite documented in deployment.md.
    env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
  },
});
