import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hostSourceOpensOnYoutube,
  resolveHostSourceTabUrl,
} from './hostSourceTabUrl.js'

function episode(overrides = {}) {
  return {
    id: '032-mitchell',
    embedAllows: undefined,
    youtubeWatchUrl: 'https://www.youtube.com/watch?v=NXGXtm6gcxk',
    youtubeVideoId: 'NXGXtm6gcxk',
    playbackHost: 'youtube',
    ...overrides,
  }
}

describe('resolveHostSourceTabUrl', () => {
  it('opens YouTube directly for the current non-embeddable catalog episode', () => {
    const args = {
      catalogEp: episode({ embedAllows: false }),
      catalogEpisodeId: '032-mitchell',
      origin: 'https://riffsync.tv',
    }

    assert.equal(resolveHostSourceTabUrl(args), 'https://www.youtube.com/watch?v=NXGXtm6gcxk')
    assert.equal(hostSourceOpensOnYoutube(args), true)
  })

  it('keeps the party-capture tab for embeddable episodes', () => {
    const args = {
      catalogEp: episode({ embedAllows: true }),
      catalogEpisodeId: '032-mitchell',
      origin: 'https://riffsync.tv/',
    }

    assert.equal(
      resolveHostSourceTabUrl(args),
      'https://riffsync.tv/watch/032-mitchell?partyCapture=1',
    )
    assert.equal(hostSourceOpensOnYoutube(args), false)
  })

  it('keeps the party-capture tab when the loaded catalog row is stale or missing', () => {
    assert.equal(
      resolveHostSourceTabUrl({
        catalogEp: episode({ id: 'not-current', embedAllows: false }),
        catalogEpisodeId: '032-mitchell',
        origin: 'https://riffsync.tv',
      }),
      'https://riffsync.tv/watch/032-mitchell?partyCapture=1',
    )

    assert.equal(
      resolveHostSourceTabUrl({
        catalogEp: undefined,
        catalogEpisodeId: 'movie with spaces',
        origin: 'https://riffsync.tv',
      }),
      'https://riffsync.tv/watch/movie%20with%20spaces?partyCapture=1',
    )
  })

  it('uses party-capture RiffSync watch URL for Custom-host rows', () => {
    const args = {
      catalogEp: episode({
        playbackHost: 'custom',
        embedAllows: false,
        youtubeVideoId: null,
      }),
      catalogEpisodeId: '032-mitchell',
      origin: 'https://riffsync.tv',
    }

    assert.equal(
      resolveHostSourceTabUrl(args),
      'https://riffsync.tv/watch/032-mitchell?partyCapture=1',
    )
    assert.equal(hostSourceOpensOnYoutube(args), false)
  })
})
