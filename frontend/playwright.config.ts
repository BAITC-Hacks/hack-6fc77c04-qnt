import { defineConfig } from "@playwright/test";

// Tests use the installed Edge on Windows; elsewhere install Playwright Chromium.
// Start the real backend on port 8000 separately (README / docs/UI_QA.md).
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 30000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: process.platform === "win32" ? "msedge" : undefined,
    locale: "ru-RU",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      env: {
        VITE_DEMO_MODE: "false",
        VITE_PUBLIC_SITE_URL: "https://qnt.l33t.kz",
      },
    },
    {
      command: "npm run dev -- --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      env: { VITE_DEMO_MODE: "true", VITE_PUBLIC_SITE_URL: "" },
    },
  ],
});
