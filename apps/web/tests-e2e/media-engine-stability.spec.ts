import { test, expect } from '@playwright/test'

/**
 * Media engine stability scenarios. Full WebRTC requires local SFU + browser permissions;
 * this spec validates room page mount without SFU reconnect on snapshot-style updates.
 */
test.describe('room media engine stability', () => {
  test.skip(true, 'Requires deployed room fixture and local SFU stack')

  test('5s room poll does not remount media engine', async ({ page }) => {
    await page.goto('/room/fixture-room-id')
    const wsUrls: string[] = []
    page.on('websocket', (ws) => {
      if (ws.url().includes('sfu') || ws.url().includes(':3000')) {
        wsUrls.push(ws.url())
      }
    })
    await page.waitForTimeout(12_000)
    const unique = new Set(wsUrls)
    expect(unique.size).toBeLessThanOrEqual(1)
  })
})
