import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-coaching", fullyParallel: false, workers: 1,
  use: { baseURL: "http://localhost:4321", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: { command: "npm run dev -- --port 4321", env: { VITE_DEV_MOCKS: "1" }, port: 4321, reuseExistingServer: false },
});
