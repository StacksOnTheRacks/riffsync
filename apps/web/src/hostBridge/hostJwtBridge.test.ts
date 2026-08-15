// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HOST_BRIDGE_CHANNEL,
  handleHostBridgeMessage,
  isAllowedHostBridgeOrigin,
} from './hostJwtBridge'

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    channel: HOST_BRIDGE_CHANNEL,
    v: 1,
    type: 'HOST_JWT_REQUEST',
    requestId: 'req-1',
    ...overrides,
  }
}

function createDeps() {
  const posted: unknown[] = []
  const pageWindow = {} as Window
  return {
    posted,
    pageWindow,
    refreshFanTokensIfStale: vi.fn(async () => {}),
    getFanAccessToken: vi.fn(() => 'fan-access'),
    getFanRefreshToken: vi.fn(() => 'refresh-should-not-be-posted'),
    postMessage: vi.fn((message: unknown) => {
      posted.push(message)
    }),
  }
}

describe('hostJwtBridge', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('allows only C1 SPA origins', () => {
    expect(isAllowedHostBridgeOrigin('https://riffsync.tv')).toBe(true)
    expect(isAllowedHostBridgeOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedHostBridgeOrigin('https://evil.example')).toBe(false)
  })

  it('ignores wrong channel, non-window source, and disallowed origin', async () => {
    const deps = createDeps()
    await handleHostBridgeMessage(
      {
        source: {},
        origin: 'https://riffsync.tv',
        data: envelope(),
      } as MessageEvent,
      deps,
    )
    await handleHostBridgeMessage(
      {
        source: deps.pageWindow,
        origin: 'https://evil.example',
        data: envelope(),
      } as MessageEvent,
      deps,
    )
    await handleHostBridgeMessage(
      {
        source: deps.pageWindow,
        origin: 'https://riffsync.tv',
        data: envelope({ channel: 'other' }),
      } as MessageEvent,
      deps,
    )

    expect(deps.refreshFanTokensIfStale).not.toHaveBeenCalled()
    expect(deps.posted).toEqual([])
  })

  it('returns the fan access token after refreshFanTokensIfStale and never posts a refresh token', async () => {
    const deps = createDeps()
    await handleHostBridgeMessage(
      {
        source: deps.pageWindow,
        origin: 'https://riffsync.tv',
        data: envelope(),
      } as MessageEvent,
      deps,
    )

    expect(deps.refreshFanTokensIfStale).toHaveBeenCalledOnce()
    expect(deps.posted).toEqual([
      {
        channel: HOST_BRIDGE_CHANNEL,
        v: 1,
        type: 'HOST_JWT_RESPONSE',
        requestId: 'req-1',
        ok: true,
        accessToken: 'fan-access',
      },
    ])
    expect(JSON.stringify(deps.posted)).not.toContain('refresh-should-not-be-posted')
  })

  it('returns not_signed_in when there is no session', async () => {
    const deps = createDeps()
    deps.getFanAccessToken.mockReturnValue(null)
    deps.getFanRefreshToken.mockReturnValue(null)

    await handleHostBridgeMessage(
      {
        source: deps.pageWindow,
        origin: 'http://localhost:5173',
        data: envelope(),
      } as MessageEvent,
      deps,
    )

    expect(deps.posted[0]).toMatchObject({
      ok: false,
      error: 'not_signed_in',
      type: 'HOST_JWT_RESPONSE',
    })
  })

  it('returns refresh_failed when a prior session cannot produce an access token', async () => {
    const deps = createDeps()
    deps.getFanAccessToken.mockReturnValue(null)
    deps.getFanRefreshToken.mockReturnValue('stale-refresh')

    await handleHostBridgeMessage(
      {
        source: deps.pageWindow,
        origin: 'https://riffsync.tv',
        data: envelope(),
      } as MessageEvent,
      deps,
    )

    expect(deps.posted[0]).toMatchObject({
      ok: false,
      error: 'refresh_failed',
    })
  })
})
