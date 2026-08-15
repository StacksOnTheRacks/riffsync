import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isPartyCapturePlaybackUrl,
  mediaPlaybackControlErrorMessage,
} from './mediaPlayback.js'

describe('isPartyCapturePlaybackUrl', () => {
  it('accepts allowed SPA party-capture watch URLs', () => {
    assert.equal(
      isPartyCapturePlaybackUrl('https://riffsync.tv/watch/005-eegah?partyCapture=1'),
      true,
    )
    assert.equal(
      isPartyCapturePlaybackUrl('http://localhost:5173/watch/032-mitchell?partyCapture=1'),
      true,
    )
  })

  it('rejects direct YouTube and non-party-capture watch URLs', () => {
    assert.equal(
      isPartyCapturePlaybackUrl('https://www.youtube.com/watch?v=NXGXtm6gcxk'),
      false,
    )
    assert.equal(isPartyCapturePlaybackUrl('https://riffsync.tv/watch/005-eegah'), false)
    assert.equal(isPartyCapturePlaybackUrl('https://riffsync.tv/room/party-1'), false)
    assert.equal(isPartyCapturePlaybackUrl(''), false)
  })
})

describe('mediaPlaybackControlErrorMessage', () => {
  it('maps refuse reasons to panel copy', () => {
    assert.match(
      mediaPlaybackControlErrorMessage({ ok: false, reason: 'not_controllable' }),
      /party-capture/,
    )
    assert.match(
      mediaPlaybackControlErrorMessage({ ok: false, reason: 'media_tab_closed' }),
      /Open the media tab/,
    )
    assert.equal(mediaPlaybackControlErrorMessage({ ok: true }), '')
  })
})
