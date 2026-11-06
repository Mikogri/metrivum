import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-auth", workers: 1, fullyParallel: false,
  use: { baseURL: "http://localhost:4357", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "node ../../node_modules/@react-router/dev/bin.cjs dev --port 4357",
    env: { PORT: "4357", VITE_DEV_MOCKS: "0", VITE_SUPABASE_URL: "http://127.0.0.1:54321", VITE_SUPABASE_PUBLISHABLE_KEY: "local-public-key", VITE_TURNSTILE_SITE_KEY: "browser-intercepted-public-key", VITE_AUTH_CAPTCHA_REQUIRED: "true" },
    port: 4357, reuseExistingServer: false,
  },
});
