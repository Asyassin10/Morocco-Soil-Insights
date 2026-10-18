import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests", testMatch: "**/*.spec.ts", fullyParallel: false, workers: 1, timeout: 30000,
  use: { ...devices["Desktop Chrome"], trace: "retain-on-failure", screenshot: "only-on-failure", launchOptions: { args: ["--enable-unsafe-swiftshader"] } },
  projects: [
    { name: "empty-token", testMatch: "empty-token.spec.ts", use: { baseURL: "http://127.0.0.1:3100" } },
    { name: "interaction-adapter", testMatch: "field-flow.spec.ts", use: { baseURL: "http://127.0.0.1:3101" } },
  ],
  webServer: [
    { command: "npm run dev -- --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 120000, env: { MSI_E2E_EMPTY_TOKEN: "1", NEXT_PUBLIC_MAPBOX_TOKEN: "", BACKEND_URL: "http://127.0.0.1:8010" } },
    { command: "npm run dev -- --port 3101", url: "http://127.0.0.1:3101", reuseExistingServer: false, timeout: 120000, env: { MSI_E2E_MAP: "1", NEXT_PUBLIC_MAPBOX_TOKEN: "pk.development-test-adapter", BACKEND_URL: "http://127.0.0.1:8010" } },
  ],
});
