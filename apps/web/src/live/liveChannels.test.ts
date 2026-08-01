import { describe, expect, it } from 'vitest'
import { STATIC_INDEXABLE_ROUTES } from '../seo/indexableRoutes'
import {
  DEFAULT_LIVE_CHANNEL_PATH,
  enabledLiveChannelPaths,
  getLiveChannelSeed,
  LIVE_CHANNELS,
} from './liveChannels'

describe('liveChannels registry', () => {
  it('defaults nav to the forever-a-thon path', () => {
    expect(DEFAULT_LIVE_CHANNEL_PATH).toBe('/live/mst3k-forever-a-thon')
    expect(getLiveChannelSeed('mst3k-forever-a-thon')?.enabled).toBe(true)
  })

  it('keeps enabled live paths in the static SEO indexable list', () => {
    for (const path of enabledLiveChannelPaths()) {
      expect(STATIC_INDEXABLE_ROUTES).toContain(path)
    }
    expect(LIVE_CHANNELS.length).toBeGreaterThan(0)
  })
})
