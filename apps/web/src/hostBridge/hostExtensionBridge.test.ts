// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { pingHostExtension, getHostMediaTabState, openHostMediaTab } from './hostExtensionBridge'

describe('hostExtensionBridge', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: () => 'req-1',
    })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'https://riffsync.tv' },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns false when ping times out', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation(() => {})
    const ok = await pingHostExtension(20)
    expect(ok).toBe(false)
  })

  it('resolves true on HOST_EXTENSION_PONG', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation((message) => {
      const data = message as { requestId: string }
      queueMicrotask(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              channel: 'riffsync-host-bridge',
              v: 1,
              type: 'HOST_EXTENSION_PONG',
              requestId: data.requestId,
              ok: true,
            },
            origin: 'https://riffsync.tv',
          }),
        )
      })
    })
    await expect(pingHostExtension(500)).resolves.toBe(true)
  })

  it('maps media tab state responses', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation((message) => {
      const data = message as { requestId: string; type: string }
      if (data.type !== 'HOST_MEDIA_TAB_GET_STATE') return
      queueMicrotask(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              channel: 'riffsync-host-bridge',
              v: 1,
              type: 'HOST_MEDIA_TAB_STATE',
              requestId: data.requestId,
              ok: true,
              bound: true,
              roomId: 'r1',
              origin: 'https://riffsync.tv',
              mediaTabOpen: true,
              mediaTabId: 9,
              mediaTabUrl: 'https://riffsync.tv/watch/ep?partyCapture=1',
              mediaPlaybackControllable: true,
            },
            origin: 'https://riffsync.tv',
          }),
        )
      })
    })
    const state = await getHostMediaTabState()
    expect(state?.mediaTabOpen).toBe(true)
    expect(state?.mediaPlaybackControllable).toBe(true)
  })

  it('opens media tab via bridge', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation((message) => {
      const data = message as { requestId: string; type: string; url?: string }
      if (data.type !== 'HOST_MEDIA_TAB_OPEN') return
      queueMicrotask(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              channel: 'riffsync-host-bridge',
              v: 1,
              type: 'HOST_MEDIA_TAB_STATE',
              requestId: data.requestId,
              ok: true,
              bound: true,
              roomId: 'r1',
              origin: 'https://riffsync.tv',
              mediaTabOpen: true,
              mediaTabId: 3,
              mediaTabUrl: data.url,
              mediaPlaybackControllable: false,
            },
            origin: 'https://riffsync.tv',
          }),
        )
      })
    })
    const state = await openHostMediaTab('https://youtube.com/watch?v=1')
    expect(state?.mediaTabUrl).toBe('https://youtube.com/watch?v=1')
    expect(state?.mediaPlaybackControllable).toBe(false)
  })
})
