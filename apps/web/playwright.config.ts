import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.RIFFSYNC_E2E_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:5173'

/**
 * Chromium-first; Trystero-style fake media flags (`https://github.com/dmotz/trystero/blob/main/playwright.config.ts`).
 * Live **`getDisplayMedia`** in Linux Docker is fragile — use **`?riffsyncE2e=1`** (dev) synthetic stream.
 * @see https://github.com/microsoft/playwright/issues/31636
 */
export default defineConfig({
  testDir: './tests-e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--disable-features=WebRtcHideLocalIpsWithMdns',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer:
    process.env.RIFFSYNC_E2E_RUN === '1' && process.env.RIFFSYNC_E2E_NO_WEBSERVER !== '1' ?
      {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
})
