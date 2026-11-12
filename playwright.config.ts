import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

// SPEC §3 Testing: Android and iPhone run only the tests that could fail differently on a phone (layout, touch,
// native pickers, Safari's engine): these whole files, plus tests tagged @phone elsewhere. Everything runs on desktop.
const PHONE_FILES = ['a11y', 'header', 'post-it', 'dashboard', 'account-layout', 'calm-ux', 'app-shell', 'security', 'capture', 'my-people']
const phoneOnly = new RegExp(String.raw`\b(${PHONE_FILES.join('|')})\.spec\.ts|@phone`)

export default defineConfig({
  testDir: './src/tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    // Spec §3: test a phone-sized screen. Android is the target phone.
    { name: 'android-phone', use: { ...devices['Pixel 7'] }, grep: phoneOnly },
    // Spec §10 Phase 3: also run as an iPhone, on Safari's engine (WebKit).
    // Its service worker is off: on WebKit, requests through a service worker skip Playwright's stand-in server.
    { name: 'iphone', use: { ...devices['iPhone 14'], serviceWorkers: 'block' }, grep: phoneOnly },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
