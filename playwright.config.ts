import { defineConfig, devices } from '@playwright/test';

// Set PWTK_TEST_GROUP=full for comprehensive cross-browser/cross-device coverage.
// Default 'fast' group runs one device per category — good for PR CI checks.
const BASE_URL = process.env.PWTK_BASE_URL ?? 'http://localhost:3000';
const GROUP = process.env.PWTK_TEST_GROUP ?? 'fast';

const fastProjects = [
  {
    name: 'Desktop Chrome',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  },
  {
    name: 'iPhone 15 Pro',
    use: { ...devices['iPhone 15 Pro'] },
  },
  {
    name: 'Pixel 7',
    use: { ...devices['Pixel 7'] },
  },
  {
    name: 'iPad Pro 11',
    use: { ...devices['iPad Pro 11'] },
  },
];

const fullProjects = [
  // Desktop — all three engines
  {
    name: 'Desktop Chrome',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  },
  {
    name: 'Desktop Firefox',
    use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
  },
  {
    name: 'Desktop Safari',
    use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
  },
  // Wide desktop
  {
    name: 'Desktop Chrome 1920',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
  },
  // iOS — WebKit (closest to Safari on device)
  {
    name: 'iPhone SE',
    use: { ...devices['iPhone SE'] },
  },
  {
    name: 'iPhone 14',
    use: { ...devices['iPhone 14'] },
  },
  {
    name: 'iPhone 15 Pro',
    use: { ...devices['iPhone 15 Pro'] },
  },
  {
    name: 'iPhone 15 Pro Max',
    use: { ...devices['iPhone 15 Pro Max'] },
  },
  // Android — Chromium
  {
    name: 'Pixel 7',
    use: { ...devices['Pixel 7'] },
  },
  {
    name: 'Galaxy S9+',
    use: { ...devices['Galaxy S9+'] },
  },
  // Tablets
  {
    name: 'iPad Pro 11',
    use: { ...devices['iPad Pro 11'] },
  },
  {
    name: 'iPad Mini',
    use: { ...devices['iPad Mini'] },
  },
];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  projects: GROUP === 'full' ? fullProjects : fastProjects,
});
