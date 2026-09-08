import { defineConfig } from '@playwright/test';

const remote = process.env.NODEFLOW_TEST_URL;
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000, toHaveScreenshot: { maxDiffPixelRatio: 0.005 } },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: remote ?? 'http://127.0.0.1:8010',
    viewport: { width: 1440, height: 1000 },
    browserName: 'chromium',
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: remote ? undefined : {
    command: '../backend/venv/bin/uvicorn main:app --app-dir ../backend --host 127.0.0.1 --port 8010',
    url: 'http://127.0.0.1:8010/api/v1/health',
    reuseExistingServer: false,
    env: { NODEFLOW_ENV: 'test', GROQ_API_KEY: '', VERCEL_TOKEN: '', VERCEL_OIDC_TOKEN: '' },
  },
});
