import { defineConfig, devices } from "@playwright/test";

// E2E runs against the Docker-served build, which is the only place the frontend
// and the API share an origin. Static export ignores Next rewrites, so a standalone
// `next dev` server cannot proxy /api and is not a valid target.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  // One shared demo database backs every test, so runs must not overlap or they
  // race on the same rows. This also makes `--repeat-each` safe.
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});