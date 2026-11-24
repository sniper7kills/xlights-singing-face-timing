import { defineConfig, devices } from '@playwright/test'

const PREVIEW_URL = 'http://localhost:4173'

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: PREVIEW_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The tests run against the built app, so a stale dist folder must not reach them.
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: PREVIEW_URL,
    // A server from another checkout can serve a different build.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
