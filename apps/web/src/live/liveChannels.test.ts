import { describe, expect, it } from 'vitest'
import { CATALOG_VIDEO_PLACEHOLDER_IMAGE_URL } from '../catalog/mockCatalog'
import {
  getLivePathForEpisodeId,
  liveChannelCardImageUrl,
  officialLiveSlugFromPath,
  youtubeHqThumbnailUrl,
} from './liveChannels'

describe('live channel path helpers', () => {
  it('uses the catalog episode id as the live slug', () => {
    expect(getLivePathForEpisodeId('mst3k-forever-a-thon')).toBe('/live/mst3k-forever-a-thon')
  })

  it('omits empty episode ids', () => {
    expect(getLivePathForEpisodeId('   ')).toBeUndefined()
  })

  it('does not treat the Live Now watch-parties tab as a channel slug', () => {
    expect(officialLiveSlugFromPath('/live/watch-parties')).toBeUndefined()
    expect(officialLiveSlugFromPath('/live')).toBeUndefined()
    expect(officialLiveSlugFromPath('/live/mst3k-forever-a-thon')).toBe('mst3k-forever-a-thon')
  })

  it('prefers a YouTube still for stream cards when the video id is present', () => {
    expect(youtubeHqThumbnailUrl('abcdefghijk')).toBe('https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg')
    expect(
      liveChannelCardImageUrl({
        youtubeVideoId: 'abcdefghijk',
        posterImageUrl: '/poster.jpg',
        backdropImageUrl: '/backdrop.jpg',
      }),
    ).toBe('https://img.youtube.com/vi/abcdefghijk/hqdefault.jpg')
    expect(
      liveChannelCardImageUrl({
        youtubeVideoId: null,
        posterImageUrl: null,
        backdropImageUrl: null,
      }),
    ).toBe(CATALOG_VIDEO_PLACEHOLDER_IMAGE_URL)
  })
})

