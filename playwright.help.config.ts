import { defineConfig, devices } from '@playwright/test'

// `npm run docs:images` (SPEC §5 Home page and Help): takes the Help and home page pictures against the same test
// server as the browser tests, at phone size in dark mode. Not part of the test suites.
export default defineConfig({
  testDir: './scripts/help-images',
  testMatch: 'shots.spec.ts',
  fullyParallel: true,
  reporter: 'list',
  use: {
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 780 },
    deviceScaleFactor: 1.5,
    baseURL: 'http://localhost:4173',
    timezoneId: 'America/New_York',
    locale: 'en-US',
  },
  webServer: {
    command: 'npx vite build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
