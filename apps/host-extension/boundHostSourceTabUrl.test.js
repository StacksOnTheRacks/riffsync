import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  boundHostSourceTabErrorMessage,
  resolveBoundHostSourceTabUrl,
} from './boundHostSourceTabUrl.js'

const ORIGIN = 'https://riffsync.tv'

function embeddableRow(overrides = {}) {
  return {
    id: '005-eegah',
    title: 'Eegah',
    experimentNumber: 5,
    catalog: 'mst3k',
    tags: [],
    labels: [],
    youtubeVideoId: 'abc12345678',
    youtubeWatchUrl: 'https://www.youtube.com/watch?v=abc12345678',
    posterImageUrl: null,
    tagline: null,
    embedAllows: true,
    playbackHost: 'youtube',
    customPlaybackUrl: null,
    ...overrides,
  }
}

function nonEmbeddableRow(overrides = {}) {
  return embeddableRow({
    id: '032-mitchell',
    title: 'Mitchell',
    experimentNumber: 32,
    youtubeVideoId: 'NXGXtm6gcxk',
    youtubeWatchUrl: 'https://www.youtube.com/watch?v=NXGXtm6gcxk',
    embedAllows: false,
    ...overrides,
  })
}

describe('resolveBoundHostSourceTabUrl', () => {
  it('opens party-capture for an embeddable library row matching the room', () => {
    const result = resolveBoundHostSourceTabUrl({
      room: { catalogEpisodeId: '005-eegah' },
      origin: ORIGIN,
      libraryEntries: [embeddableRow()],
    })

    assert.deepEqual(result, {
      ok: true,
      url: 'https://riffsync.tv/watch/005-eegah?partyCapture=1',
    })
  })

  it('opens YouTube for a non-embeddable library row matching the room', () => {
    const result = resolveBoundHostSourceTabUrl({
      room: { catalogEpisodeId: '032-mitchell' },
      origin: `${ORIGIN}/`,
      libraryEntries: [nonEmbeddableRow()],
    })

    assert.deepEqual(result, {
      ok: true,
      url: 'https://www.youtube.com/watch?v=NXGXtm6gcxk',
    })
  })

  it('falls back to party-capture when the library has no matching row', () => {
    const result = resolveBoundHostSourceTabUrl({
      room: { catalogEpisodeId: '005-eegah' },
      origin: ORIGIN,
      libraryEntries: [],
    })

    assert.deepEqual(result, {
      ok: true,
      url: 'https://riffsync.tv/watch/005-eegah?partyCapture=1',
    })
  })

  it('refuses when room or catalogEpisodeId is missing', () => {
    assert.equal(
      resolveBoundHostSourceTabUrl({
        room: null,
        origin: ORIGIN,
        libraryEntries: [],
      }).reason,
      'missing_room',
    )

    assert.equal(
      resolveBoundHostSourceTabUrl({
        room: { catalogEpisodeId: '' },
        origin: ORIGIN,
        libraryEntries: [],
      }).reason,
      'missing_catalog_episode',
    )

    assert.equal(
      resolveBoundHostSourceTabUrl({
        room: { catalogEpisodeId: '005-eegah' },
        origin: '',
        libraryEntries: [],
      }).reason,
      'missing_origin',
    )
  })
})

describe('boundHostSourceTabErrorMessage', () => {
  it('maps refuse reasons to panel copy', () => {
    assert.equal(
      boundHostSourceTabErrorMessage({ ok: false, reason: 'unbound' }),
      'Open refused: active tab is not a room on an allowed origin.',
    )
    assert.equal(
      boundHostSourceTabErrorMessage({ ok: false, reason: 'room_fetch_failed' }),
      'Could not load the room title. Retry now playing, then try again.',
    )
    assert.equal(
      boundHostSourceTabErrorMessage({ ok: false, reason: 'missing_catalog_episode' }),
      'This room has no catalog title to open.',
    )
    assert.equal(boundHostSourceTabErrorMessage({ ok: true, url: 'x' }), '')
  })
})
