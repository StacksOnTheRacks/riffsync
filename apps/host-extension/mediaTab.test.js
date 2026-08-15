import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createMediaTabTracker,
  openOrNavigateHostMediaTab,
  reportHostingMediaTab,
} from './mediaTab.js'

function createMockTabs() {
  const records = new Map()
  let nextId = 1
  const calls = { create: [], update: [] }

  return {
    calls,
    remove(tabId) {
      records.delete(tabId)
    },
    api: {
      async create({ url, active }) {
        calls.create.push({ url, active })
        const id = nextId++
        const tab = { id, url, active }
        records.set(id, tab)
        return tab
      },
      async update(tabId, { url, active }) {
        calls.update.push({ tabId, url, active })
        const tab = records.get(tabId)
        if (!tab) throw new Error('No tab')
        tab.url = url
        if (active !== undefined) tab.active = active
        return tab
      },
      async get(tabId) {
        const tab = records.get(tabId)
        if (!tab) throw new Error('No tab')
        return tab
      },
    },
  }
}

const ROOM_URL = 'https://riffsync.tv/room/party-1'
const MEDIA_URL_A = 'https://riffsync.tv/watch/032-mitchell?partyCapture=1'
const MEDIA_URL_B = 'https://riffsync.tv/watch/other?partyCapture=1'

describe('media tab state', () => {
  it('creates and records a media tab when none is tracked, and reports open', async () => {
    const mock = createMockTabs()
    const tracker = createMediaTabTracker(mock.api)

    const result = await openOrNavigateHostMediaTab(tracker, ROOM_URL, MEDIA_URL_A)

    assert.equal(result.ok, true)
    assert.equal(result.mediaTabOpen, true)
    assert.equal(mock.calls.create.length, 1)
    assert.deepEqual(mock.calls.create[0], { url: MEDIA_URL_A, active: false })
    assert.equal(mock.calls.update.length, 0)
    assert.equal(tracker.getMediaTabId(), 1)
    assert.equal(tracker.isMediaTabOpen(), true)

    const reported = await reportHostingMediaTab(tracker, ROOM_URL)
    assert.equal(reported.mediaTabOpen, true)
    assert.equal(reported.bound, true)
    assert.equal(reported.mediaPlaybackControllable, true)
    assert.equal(reported.mediaTabUrl, MEDIA_URL_A)
  })

  it('reuses a live media tab with update, not a second create, and reports open', async () => {
    const mock = createMockTabs()
    const tracker = createMediaTabTracker(mock.api)

    await openOrNavigateHostMediaTab(tracker, ROOM_URL, MEDIA_URL_A)
    const firstId = tracker.getMediaTabId()
    const result = await openOrNavigateHostMediaTab(tracker, ROOM_URL, MEDIA_URL_B)

    assert.equal(result.ok, true)
    assert.equal(result.mediaTabOpen, true)
    assert.equal(tracker.getMediaTabId(), firstId)
    assert.equal(mock.calls.create.length, 1)
    assert.equal(mock.calls.update.length, 1)
    assert.deepEqual(mock.calls.update[0], {
      tabId: firstId,
      url: MEDIA_URL_B,
      active: false,
    })
  })

  it('creates again when the tracked tab is gone', async () => {
    const mock = createMockTabs()
    const tracker = createMediaTabTracker(mock.api)

    await openOrNavigateHostMediaTab(tracker, ROOM_URL, MEDIA_URL_A)
    const goneId = tracker.getMediaTabId()
    mock.remove(goneId)

    const result = await openOrNavigateHostMediaTab(tracker, ROOM_URL, MEDIA_URL_B)

    assert.equal(result.ok, true)
    assert.equal(mock.calls.create.length, 2)
    assert.equal(mock.calls.update.length, 0)
    assert.notEqual(tracker.getMediaTabId(), goneId)
    assert.deepEqual(mock.calls.create[1], { url: MEDIA_URL_B, active: false })
  })

  it('reports not open after the media tab is closed or the id is cleared', async () => {
    const mock = createMockTabs()
    const tracker = createMediaTabTracker(mock.api)

    await openOrNavigateHostMediaTab(tracker, ROOM_URL, MEDIA_URL_A)
    const tabId = tracker.getMediaTabId()
    mock.remove(tabId)
    tracker.handleTabRemoved(tabId)

    assert.equal(tracker.isMediaTabOpen(), false)
    assert.equal(tracker.getMediaTabId(), null)

    const afterClose = await reportHostingMediaTab(tracker, ROOM_URL)
    assert.equal(afterClose.mediaTabOpen, false)

    await openOrNavigateHostMediaTab(tracker, ROOM_URL, MEDIA_URL_A)
    tracker.clearMediaTabId()
    const afterClear = await reportHostingMediaTab(tracker, ROOM_URL)
    assert.equal(afterClear.mediaTabOpen, false)
  })

  it('always passes active: false on create and update', async () => {
    const mock = createMockTabs()
    const tracker = createMediaTabTracker(mock.api)

    await tracker.openOrNavigate(MEDIA_URL_A)
    await tracker.openOrNavigate(MEDIA_URL_B)

    assert.ok(mock.calls.create.length >= 1)
    assert.ok(mock.calls.update.length >= 1)
    for (const call of mock.calls.create) {
      assert.equal(call.active, false)
    }
    for (const call of mock.calls.update) {
      assert.equal(call.active, false)
    }
  })

  it('refuses open/navigate and does not claim open when the room is unbound', async () => {
    const mock = createMockTabs()
    const tracker = createMediaTabTracker(mock.api)

    const refused = await openOrNavigateHostMediaTab(
      tracker,
      'https://example.com/room/party-1',
      MEDIA_URL_A,
    )

    assert.equal(refused.ok, false)
    assert.equal(refused.bound, false)
    assert.equal(refused.mediaTabOpen, false)
    assert.equal(mock.calls.create.length, 0)

    await openOrNavigateHostMediaTab(tracker, ROOM_URL, MEDIA_URL_A)
    const unboundReport = await reportHostingMediaTab(tracker, 'https://riffsync.tv/watch/x')
    assert.equal(unboundReport.bound, false)
    assert.equal(unboundReport.mediaTabOpen, false)
  })

  it('marks direct YouTube media tabs as not playback-controllable', async () => {
    const mock = createMockTabs()
    const tracker = createMediaTabTracker(mock.api)
    const youtubeUrl = 'https://www.youtube.com/watch?v=NXGXtm6gcxk'

    const result = await openOrNavigateHostMediaTab(tracker, ROOM_URL, youtubeUrl)
    assert.equal(result.ok, true)
    assert.equal(result.mediaPlaybackControllable, false)

    const reported = await reportHostingMediaTab(tracker, ROOM_URL)
    assert.equal(reported.mediaTabOpen, true)
    assert.equal(reported.mediaPlaybackControllable, false)
  })
})
