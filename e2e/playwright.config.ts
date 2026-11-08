import { defineConfig, devices } from "@playwright/test";

export const STATIC_PORT = 4410;

export default defineConfig({
  testDir: ".",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL: `http://127.0.0.1:${STATIC_PORT}/`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node e2e/serve-example.mjs ${STATIC_PORT}`,
    cwd: "..",
    url: `http://127.0.0.1:${STATIC_PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
