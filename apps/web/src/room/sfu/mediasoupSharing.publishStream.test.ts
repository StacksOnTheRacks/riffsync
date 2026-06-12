import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config/sfuWsUrl', () => ({
  getPublicSfuWsUrl: vi.fn(() => undefined),
}))

type WsListener = (ev?: { data?: string }) => void

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  static CLOSED = 3

  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  private listeners = new Map<string, Set<WsListener>>()

  constructor(_url: string) {
    void _url
    MockWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.()
    })
  }

  addEventListener(type: string, fn: WsListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }

  send(raw: string) {
    const msg = JSON.parse(raw) as { type?: string; id?: number; method?: string }
    const { type, id, method } = msg
    if (type !== 'request' || id === undefined || !method) return
    queueMicrotask(() => {
      const data = this.responseData(method)
      this.onmessage?.({
        data: JSON.stringify({ type: 'response', id, data }),
      })
    })
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    for (const fn of this.listeners.get('close') ?? []) fn()
  }

  private responseData(method: string): Record<string, unknown> {
    switch (method) {
      case 'getRouterRtpCapabilities':
        return { routerRtpCapabilities: { codecs: [], headerExtensions: [] } }
      case 'createWebRtcTransport':
        return {
          transportId: `transport-${method}`,
          iceParameters: { iceLite: true },
          iceCandidates: [],
          dtlsParameters: { role: 'auto', fingerprints: [] },
        }
      case 'connectWebRtcTransport':
        return {}
      case 'produce':
        return { producerId: `producer-${Date.now()}` }
      case 'listProducers':
        return { producers: [] }
      default:
        return {}
    }
  }
}

type MockProducer = {
  id: string
  kind: string
  track: MediaStreamTrack
  closed: boolean
  paused: boolean
  close: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
}

const createdProducers: MockProducer[] = []

const mockSendTransport = {
  connectionState: 'connected' as const,
  on: vi.fn(),
  removeListener: vi.fn(),
  produce: vi.fn(),
}

const mockRecvTransport = {
  connectionState: 'connected' as const,
  on: vi.fn(),
  removeListener: vi.fn(),
  consume: vi.fn(),
}

vi.mock('mediasoup-client', () => {
  class Device {
    rtpCapabilities = {}
    async load() {
      return undefined
    }
    createSendTransport(opts: { id: string }) {
      void opts
      return mockSendTransport
    }
    createRecvTransport(opts: { id: string }) {
      void opts
      return mockRecvTransport
    }
  }
  return { Device, default: { Device } }
})

import { connectSfuUnifiedSession } from './mediasoupSharing'

class MockMediaStream {
  private tracks: MediaStreamTrack[] = []

  constructor(tracks?: MediaStreamTrack[]) {
    if (tracks) this.tracks = [...tracks]
  }

  getTracks(): MediaStreamTrack[] {
    return this.tracks
  }

  addTrack(track: MediaStreamTrack) {
    this.tracks.push(track)
  }

  removeTrack(track: MediaStreamTrack) {
    this.tracks = this.tracks.filter((t) => t !== track)
  }
}

function mockTrack(kind: 'audio' | 'video', id: string): MediaStreamTrack {
  return { kind, id } as MediaStreamTrack
}

function mockStream(tracks: MediaStreamTrack[]): MediaStream {
  return new MockMediaStream(tracks) as unknown as MediaStream
}

type ProduceHandler = (
  args: { kind: string; rtpParameters: object; appData: object },
  callback: (arg: { id: string }) => void,
  errback: (e: Error) => void,
) => void

type ConnectHandler = (
  args: { dtlsParameters: object },
  callback: () => void,
  errback: (e: Error) => void,
) => void

function wireSendTransportProduce(produceDelayMs = 0) {
  let produceHandler: ProduceHandler | undefined
  let connectHandler: ConnectHandler | undefined

  mockSendTransport.on.mockImplementation((event: string, handler: unknown) => {
    if (event === 'produce') produceHandler = handler as ProduceHandler
    if (event === 'connect') connectHandler = handler as ConnectHandler
  })

  mockSendTransport.produce.mockImplementation(async (opts: { track: MediaStreamTrack; appData: object }) => {
    if (produceDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, produceDelayMs))
    }
    const producerId = `producer-${opts.track.id}`
    const producer: MockProducer = {
      id: producerId,
      kind: opts.track.kind,
      track: opts.track,
      closed: false,
      paused: false,
      close: vi.fn(() => {
        producer.closed = true
      }),
      pause: vi.fn(() => {
        producer.paused = true
      }),
      resume: vi.fn(() => {
        producer.paused = false
      }),
    }
    await new Promise<void>((resolve, reject) => {
      if (!produceHandler) {
        reject(new Error('produce handler missing'))
        return
      }
      produceHandler(
        { kind: opts.track.kind, rtpParameters: {}, appData: opts.appData },
        ({ id }) => {
          producer.id = id
          createdProducers.push(producer)
          resolve()
        },
        reject,
      )
    })
    if (connectHandler) {
      connectHandler({ dtlsParameters: {} }, () => undefined, () => undefined)
    }
    return producer
  })
}

async function connectProducerSession() {
  const session = await connectSfuUnifiedSession({
    wsBaseUrl: 'ws://127.0.0.1:3000',
    token: 'tok',
    tokenRole: 'producer',
    getIceServers: async () => [],
    onRemoteStream: () => undefined,
  })
  await session.ready
  return session
}

describe('connectSfuUnifiedSession publishStream incremental produce', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    createdProducers.length = 0
    mockSendTransport.on.mockReset()
    mockSendTransport.removeListener.mockReset()
    mockSendTransport.produce.mockReset()
    mockRecvTransport.on.mockReset()
    mockRecvTransport.removeListener.mockReset()
    mockRecvTransport.consume.mockReset()
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
    vi.stubGlobal('MediaStream', MockMediaStream as unknown as typeof MediaStream)
    wireSendTransportProduce()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('leaves an existing video producer when publishing audio-only', async () => {
    const session = await connectProducerSession()
    const audioTrack = mockTrack('audio', 'audio-partial')
    const videoTrack = mockTrack('video', 'video-partial')

    await session.publishStream(mockStream([audioTrack, videoTrack]), 'participant_av')
    const videoProducer = createdProducers.find((p) => p.track.id === 'video-partial')
    expect(videoProducer).toBeDefined()
    expect(session.getProducerCount()).toBe(2)

    mockSendTransport.produce.mockClear()
    await session.publishStream(mockStream([audioTrack]), 'participant_av')

    expect(videoProducer!.close).not.toHaveBeenCalled()
    expect(mockSendTransport.produce).not.toHaveBeenCalled()
    expect(session.getProducerCount()).toBe(2)
    session.close()
  })

  it('leaves an existing audio producer when publishing video-only', async () => {
    const session = await connectProducerSession()
    const audioTrack = mockTrack('audio', 'audio-only-survive')
    const videoTrack = mockTrack('video', 'video-only-add')

    await session.publishStream(mockStream([audioTrack]), 'participant_av')
    const audioProducer = createdProducers.find((p) => p.track.id === 'audio-only-survive')
    expect(audioProducer).toBeDefined()

    mockSendTransport.produce.mockClear()
    await session.publishStream(mockStream([videoTrack]), 'participant_av')

    expect(audioProducer!.close).not.toHaveBeenCalled()
    expect(mockSendTransport.produce).toHaveBeenCalledOnce()
    expect(session.getProducerCount()).toBe(2)
    session.close()
  })

  it('is idempotent when re-publishing the same track ids', async () => {
    const session = await connectProducerSession()
    const audioTrack = mockTrack('audio', 'audio-idem')
    const videoTrack = mockTrack('video', 'video-idem')
    const stream = mockStream([audioTrack, videoTrack])

    await session.publishStream(stream, 'participant_av')
    expect(mockSendTransport.produce).toHaveBeenCalledTimes(2)

    mockSendTransport.produce.mockClear()
    await session.publishStream(stream, 'participant_av')

    expect(mockSendTransport.produce).not.toHaveBeenCalled()
    expect(session.getProducerCount()).toBe(2)
    session.close()
  })

  it('adds video when audio is already live and a full av stream is published', async () => {
    const session = await connectProducerSession()
    const audioTrack = mockTrack('audio', 'audio-then-video')
    const videoTrack = mockTrack('video', 'video-then-video')

    await session.publishStream(mockStream([audioTrack]), 'participant_av')
    expect(session.getProducerCount()).toBe(1)

    mockSendTransport.produce.mockClear()
    await session.publishStream(mockStream([audioTrack, videoTrack]), 'participant_av')

    expect(mockSendTransport.produce).toHaveBeenCalledOnce()
    expect(session.getProducerCount()).toBe(2)
    session.close()
  })

  it('publishes host_screen single-video incrementally', async () => {
    const session = await connectProducerSession()
    const screenTrack = mockTrack('video', 'screen-1')

    await session.publishStream(mockStream([screenTrack]), 'host_screen')

    expect(mockSendTransport.produce).toHaveBeenCalledOnce()
    expect(session.getProducerCount()).toBe(1)

    mockSendTransport.produce.mockClear()
    await session.publishStream(mockStream([screenTrack]), 'host_screen')

    expect(mockSendTransport.produce).not.toHaveBeenCalled()
    session.close()
  })

  it('replaces only the kind whose track id changed', async () => {
    const session = await connectProducerSession()
    const audioTrack = mockTrack('audio', 'audio-replace')
    const videoTrack = mockTrack('video', 'video-keep')

    await session.publishStream(mockStream([audioTrack, videoTrack]), 'participant_av')
    const oldAudio = createdProducers.find((p) => p.track.id === 'audio-replace')
    const videoProducer = createdProducers.find((p) => p.track.id === 'video-keep')
    expect(oldAudio).toBeDefined()
    expect(videoProducer).toBeDefined()

    const newAudioTrack = mockTrack('audio', 'audio-replaced')
    mockSendTransport.produce.mockClear()
    await session.publishStream(mockStream([newAudioTrack, videoTrack]), 'participant_av')

    expect(oldAudio!.close).toHaveBeenCalledOnce()
    expect(videoProducer!.close).not.toHaveBeenCalled()
    expect(mockSendTransport.produce).toHaveBeenCalledOnce()
    expect(session.getProducerCount()).toBe(2)
    session.close()
  })

  it('serializes overlapping publishStream calls on publishChain', async () => {
    wireSendTransportProduce(20)
    const session = await connectProducerSession()
    const trackA = mockTrack('video', 'chain-a')
    const trackB = mockTrack('video', 'chain-b')

    const first = session.publishStream(mockStream([trackA]), 'host_screen')
    const second = session.publishStream(mockStream([trackB]), 'host_screen')
    await Promise.all([first, second])

    expect(mockSendTransport.produce).toHaveBeenCalledTimes(2)
    expect(session.getProducerCount()).toBe(1)
    expect(createdProducers.find((p) => p.track.id === 'chain-b')).toBeDefined()
    session.close()
  })
})
