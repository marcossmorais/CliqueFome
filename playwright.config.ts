import { defineConfig, devices } from '@playwright/test';

/**
 * e2e contra build de produção (npm start), não npm run dev — mais fiel
 * ao que vai pro ar e bem mais rápido no CI (dev compila sob demanda,
 * ver CLAUDE.md). O CI precisa rodar `npm run build` antes desta suíte.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
