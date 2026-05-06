/**
 * Opt-in wiring test: validates **guest** **`HTMLVideoElement.videoWidth`** after **host**
 * **`?riffsyncE2e=1`** synthetic share (requires host Cognito JWT for the room creator).
 */

import { expect, test } from '@playwright/test'

function requiredEnvOk(): boolean {
  return Boolean(
    process.env.RIFFSYNC_E2E_ROOM_PATH?.trim() &&
      process.env.RIFFSYNC_E2E_HOST_ACCESS_TOKEN?.trim() &&
      process.env.RIFFSYNC_E2E_HOST_REFRESH_TOKEN?.trim() &&
      typeof process.env.RIFFSYNC_E2E_TOKEN_EXPIRY_SEC === 'string' &&
      Number.isFinite(Number(process.env.RIFFSYNC_E2E_TOKEN_EXPIRY_SEC)),
  )
}

async function primeFanAuth(page: import('@playwright/test').Page): Promise<void> {
  const access = process.env.RIFFSYNC_E2E_HOST_ACCESS_TOKEN!
  const refresh = process.env.RIFFSYNC_E2E_HOST_REFRESH_TOKEN!
  const exp = Number(process.env.RIFFSYNC_E2E_TOKEN_EXPIRY_SEC)
  await page.addInitScript(
    ([a, r, e]) => {
      localStorage.setItem('riffsync.fanAccessToken', a)
      localStorage.setItem('riffsync.fanRefreshToken', r)
      const now = Math.floor(Date.now() / 1000)
      localStorage.setItem('riffsync.fanAccessTokenExp', String(now + e))
    },
    [access, refresh, exp] as const,
  )
}

test.describe('Mesh share smoke (opt-in)', () => {
  test.skip(!requiredEnvOk(), 'Set RIFFSYNC_E2E_* env vars (see tests-e2e/README.md)')

  test('guest video surface becomes non-zero with e2e synthetic host share', async ({ browser }) => {
    const roomPath = process.env.RIFFSYNC_E2E_ROOM_PATH!.trim()
    const hostUrl = `${roomPath}?riffsyncE2e=1`
    const guestUrl = roomPath

    const hostContext = await browser.newContext()
    const guestContext = await browser.newContext()
    const hostPage = await hostContext.newPage()
    const guestPage = await guestContext.newPage()

    await primeFanAuth(hostPage)
    await hostPage.goto(hostUrl)
    await hostPage.getByRole('button', { name: 'Share Source Tab' }).click()

    await guestPage.goto(guestUrl)

    const video = guestPage.locator('.riffsync-room-page__guest-video')
    await expect(video).toBeVisible({ timeout: 60_000 })
    await expect
      .poll(async () => video.evaluate((el: HTMLVideoElement) => el.videoWidth), {
        timeout: 90_000,
        intervals: [500, 1000, 2000],
      })
      .toBeGreaterThan(0)

    await hostContext.close()
    await guestContext.close()
  })
})
