import { describe, expect, it, vi } from 'vitest'

vi.mock('../config/publicOrigin', () => ({
  getPublicOrigin: () => 'https://riffsync.tv',
}))

const { TV_LINK_PATH, getTvLinkUrl } = await import('./tvLinkPath')

describe('tvLinkPath', () => {
  it('points smart TVs at /link on the public origin', () => {
    expect(TV_LINK_PATH).toBe('/link')
    expect(getTvLinkUrl()).toBe('https://riffsync.tv/link')
  })
})
