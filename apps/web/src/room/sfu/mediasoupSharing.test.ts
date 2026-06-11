import { describe, expect, it, vi } from 'vitest'

vi.mock('../../config/sfuWsUrl', () => ({
  getPublicSfuWsUrl: vi.fn(),
}))

import { getPublicSfuWsUrl } from '../../config/sfuWsUrl'
import { resolveSfuWsBaseForToken } from './mediasoupSharing'

describe('resolveSfuWsBaseForToken', () => {
  it('prefers VITE_PUBLIC_SFU_WS_URL over token wsUrl when env is set', () => {
    vi.mocked(getPublicSfuWsUrl).mockReturnValue('ws://127.0.0.1:3000')
    expect(
      resolveSfuWsBaseForToken({
        token: 't',
        role: 'producer',
        wsUrl: 'wss://signal.riffsync.tv',
      }),
    ).toBe('ws://127.0.0.1:3000')
  })

  it('uses token wsUrl when env override is unset', () => {
    vi.mocked(getPublicSfuWsUrl).mockReturnValue(undefined)
    expect(
      resolveSfuWsBaseForToken({
        token: 't',
        role: 'producer',
        wsUrl: 'wss://signal.riffsync.tv/',
      }),
    ).toBe('wss://signal.riffsync.tv')
  })

  it('returns env URL when token wsUrl is absent', () => {
    vi.mocked(getPublicSfuWsUrl).mockReturnValue('ws://127.0.0.1:3000')
    expect(
      resolveSfuWsBaseForToken({
        token: 't',
        role: 'consumer',
      }),
    ).toBe('ws://127.0.0.1:3000')
  })
})
