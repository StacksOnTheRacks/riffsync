import { describe, expect, it } from 'vitest'
import { getLivePathForEpisodeId } from './liveChannels'

describe('live channel path helpers', () => {
  it('uses the catalog episode id as the live slug', () => {
    expect(getLivePathForEpisodeId('mst3k-forever-a-thon')).toBe('/live/mst3k-forever-a-thon')
  })

  it('omits empty episode ids', () => {
    expect(getLivePathForEpisodeId('   ')).toBeUndefined()
  })
})
