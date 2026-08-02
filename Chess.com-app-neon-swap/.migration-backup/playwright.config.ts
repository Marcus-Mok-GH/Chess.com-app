import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://localhost:3001',
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev:vite',
      url: 'http://localhost:5173',
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});