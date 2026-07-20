import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config/sfuWsUrl', () => ({
  getPublicSfuWsUrl: vi.fn(() => undefined),
}))

type WsListener = (ev?: { data?: string }) => void
type SentRequest = { method: string; data: Record<string, unknown> }

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static sentRequests: SentRequest[] = []
  static nextProducerId = 0
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
    const msg = JSON.parse(raw) as {
      type?: string
      id?: number
      method?: string
      data?: Record<string, unknown>
    }
    const { type, id, method } = msg
    if (type !== 'request' || id === undefined || !method) return
    MockWebSocket.sentRequests.push({ method, data: msg.data ?? {} })
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
        MockWebSocket.nextProducerId += 1
        return { producerId: `producer-${MockWebSocket.nextProducerId}` }
      case 'closeProducer':
        return { ok: true }
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

function wireSendTransportProduce() {
  let produceHandler: ProduceHandler | undefined
  let connectHandler: ConnectHandler | undefined

  mockSendTransport.on.mockImplementation((event: string, handler: unknown) => {
    if (event === 'produce') produceHandler = handler as ProduceHandler
    if (event === 'connect') connectHandler = handler as ConnectHandler
  })

  mockSendTransport.produce.mockImplementation(async (opts: { track: MediaStreamTrack; appData: object }) => {
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

function closeProducerRequests(): SentRequest[] {
  return MockWebSocket.sentRequests.filter((request) => request.method === 'closeProducer')
}

describe('connectSfuUnifiedSession unpublishProducerKind', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    MockWebSocket.sentRequests = []
    MockWebSocket.nextProducerId = 0
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

  it('no-ops when no matching producer is live', async () => {
    const session = await connectProducerSession()
    expect(() => session.unpublishProducerKind('participant_av', 'video')).not.toThrow()
    expect(session.getProducerCount()).toBe(0)
    session.close()
  })

  it('closes only the video producer for participant_av', async () => {
    const session = await connectProducerSession()
    const audioTrack = mockTrack('audio', 'audio-1')
    const videoTrack = mockTrack('video', 'video-1')
    await session.publishStream(mockStream([audioTrack, videoTrack]), 'participant_av')

    const audioProducer = createdProducers.find((p) => p.track.id === 'audio-1')
    const videoProducer = createdProducers.find((p) => p.track.id === 'video-1')
    expect(audioProducer).toBeDefined()
    expect(videoProducer).toBeDefined()
    expect(session.getProducerCount()).toBe(2)

    session.unpublishProducerKind('participant_av', 'video')

    expect(videoProducer!.close).toHaveBeenCalledOnce()
    expect(audioProducer!.close).not.toHaveBeenCalled()
    expect(closeProducerRequests()).toEqual([
      { method: 'closeProducer', data: { producerId: videoProducer!.id } },
    ])
    expect(session.getProducerCount()).toBe(1)
    session.close()
  })

  it('closes only the audio producer for participant_av', async () => {
    const session = await connectProducerSession()
    const audioTrack = mockTrack('audio', 'audio-2')
    const videoTrack = mockTrack('video', 'video-2')
    await session.publishStream(mockStream([audioTrack, videoTrack]), 'participant_av')

    const audioProducer = createdProducers.find((p) => p.track.id === 'audio-2')
    const videoProducer = createdProducers.find((p) => p.track.id === 'video-2')

    session.unpublishProducerKind('participant_av', 'audio')

    expect(audioProducer!.close).toHaveBeenCalledOnce()
    expect(videoProducer!.close).not.toHaveBeenCalled()
    expect(closeProducerRequests()).toEqual([
      { method: 'closeProducer', data: { producerId: audioProducer!.id } },
    ])
    expect(session.getProducerCount()).toBe(1)
    session.close()
  })

  it('leaves unpublishProducerClass closing all producers for a class', async () => {
    const session = await connectProducerSession()
    const audioTrack = mockTrack('audio', 'audio-3')
    const videoTrack = mockTrack('video', 'video-3')
    await session.publishStream(mockStream([audioTrack, videoTrack]), 'participant_av')

    const audioProducer = createdProducers.find((p) => p.track.id === 'audio-3')
    const videoProducer = createdProducers.find((p) => p.track.id === 'video-3')

    session.unpublishProducerClass('participant_av')

    expect(audioProducer!.close).toHaveBeenCalledOnce()
    expect(videoProducer!.close).toHaveBeenCalledOnce()
    expect(closeProducerRequests()).toEqual([
      { method: 'closeProducer', data: { producerId: audioProducer!.id } },
      { method: 'closeProducer', data: { producerId: videoProducer!.id } },
    ])
    expect(session.getProducerCount()).toBe(0)
    session.close()
  })
})
