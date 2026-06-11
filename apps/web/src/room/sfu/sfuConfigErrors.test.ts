import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifySignalingOpenFailure,
  isConfigClassSfuMediaError,
  isLocalDisposableSfuHost,
  LOCAL_SFU_UNREACHABLE_MSG,
  probeSfuHealthz,
  SFU_RELAY_UNREACHABLE_MSG,
  wsBaseToHealthzUrl,
} from './sfuConfigErrors'

describe('isLocalDisposableSfuHost', () => {
  it('detects local disposable signaling hosts', () => {
    expect(isLocalDisposableSfuHost('ws://127.0.0.1:3000')).toBe(true)
    expect(isLocalDisposableSfuHost('ws://localhost:3000')).toBe(true)
    expect(isLocalDisposableSfuHost('ws://host.docker.internal:3000')).toBe(true)
    expect(isLocalDisposableSfuHost('wss://signal.riffsync.tv')).toBe(false)
  })
})

describe('wsBaseToHealthzUrl', () => {
  it('maps ws and wss bases to http health probes', () => {
    expect(wsBaseToHealthzUrl('ws://127.0.0.1:3000/signaling')).toBe(
      'http://127.0.0.1:3000/healthz',
    )
    expect(wsBaseToHealthzUrl('wss://signal.riffsync.tv')).toBe(
      'https://signal.riffsync.tv/healthz',
    )
  })
})

describe('isConfigClassSfuMediaError', () => {
  it('includes configuration-class SFU media codes', () => {
    expect(isConfigClassSfuMediaError('local_sfu_unreachable')).toBe(true)
    expect(isConfigClassSfuMediaError('sfu_relay_unreachable')).toBe(true)
    expect(isConfigClassSfuMediaError('missing_ws_url')).toBe(true)
    expect(isConfigClassSfuMediaError('signaling_failed')).toBe(false)
  })
})

describe('classifySignalingOpenFailure', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('classifies local disposable host after two open failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
      }),
    )

    expect(await classifySignalingOpenFailure('ws://127.0.0.1:3000', 1)).toEqual({
      code: null,
      message: null,
    })
    expect(await classifySignalingOpenFailure('ws://127.0.0.1:3000', 2)).toEqual({
      code: 'local_sfu_unreachable',
      message: LOCAL_SFU_UNREACHABLE_MSG,
    })
  })

  it('classifies local disposable host on first failure when healthz is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    expect(await classifySignalingOpenFailure('ws://localhost:3000', 1)).toEqual({
      code: 'local_sfu_unreachable',
      message: LOCAL_SFU_UNREACHABLE_MSG,
    })
  })

  it('classifies prod signaling host after four open failures', async () => {
    expect(await classifySignalingOpenFailure('wss://signal.riffsync.tv', 3)).toEqual({
      code: null,
      message: null,
    })
    expect(await classifySignalingOpenFailure('wss://signal.riffsync.tv', 4)).toEqual({
      code: 'sfu_relay_unreachable',
      message: SFU_RELAY_UNREACHABLE_MSG,
    })
  })
})

describe('probeSfuHealthz', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false when health probe cannot connect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    await expect(probeSfuHealthz('ws://127.0.0.1:3000')).resolves.toBe(false)
  })
})
