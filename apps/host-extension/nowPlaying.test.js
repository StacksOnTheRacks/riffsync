import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nowPlayingLabel } from './nowPlaying.js'

const library = [{ id: '032-mitchell', title: 'Mitchell' }]

describe('nowPlayingLabel', () => {
  it('prefers displayTitle, then library title, then catalogEpisodeId', () => {
    assert.equal(
      nowPlayingLabel({ displayTitle: 'Host headline', catalogEpisodeId: '032-mitchell' }, library),
      'Host headline',
    )
    assert.equal(
      nowPlayingLabel({ catalogEpisodeId: '032-mitchell' }, library),
      'Mitchell',
    )
    assert.equal(nowPlayingLabel({ catalogEpisodeId: 'missing-id' }, library), 'missing-id')
  })
})
