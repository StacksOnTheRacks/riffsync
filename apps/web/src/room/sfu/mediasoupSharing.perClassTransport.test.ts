import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config/sfuWsUrl', () => ({
  getPublicSfuWsUrl: vi.fn(() => undefined),
}))

type WsListener = (ev?: { data?: string }) => void

let transportCreateCount = 0

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
    const msg = JSON.parse(raw) as { type?: string; id?: number; method?: string; data?: unknown }
    const { type, id, method } = msg
    if (type !== 'request' || id === undefined || !method) return
    queueMicrotask(() => {
      const data = this.responseData(method, msg.data)
      this.onmessage?.({
        data: JSON.stringify({ type: 'response', id, data }),
      })
    })
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    for (const fn of this.listeners.get('close') ?? []) fn()
  }

  private responseData(method: string, requestData?: unknown): Record<string, unknown> {
    switch (method) {
      case 'getRouterRtpCapabilities':
        return { routerRtpCapabilities: { codecs: [], headerExtensions: [] } }
      case 'createWebRtcTransport': {
        transportCreateCount += 1
        const isRecv =
          typeof requestData === 'object' &&
          requestData !== null &&
          (requestData as { consumer?: boolean }).consumer === true
        return {
          transportId: isRecv ? 'recv-transport' : `send-transport-${transportCreateCount}`,
          iceParameters: { iceLite: true },
          iceCandidates: [],
          dtlsParameters: { role: 'auto', fingerprints: [] },
        }
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
  close: ReturnType<typeof vi.fn>
}

const createdProducers: MockProducer[] = []
const sendTransportsById = new Map<string, ReturnType<typeof createMockSendTransport>>()

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

type ConnStateHandler = () => void

function createMockSendTransport(id: string) {
  const transport = {
    id,
    connectionState: 'connected' as string,
    on: vi.fn(),
    removeListener: vi.fn(),
    produce: vi.fn(),
    close: vi.fn(),
    emitConnectionState: (state: string) => {
      transport.connectionState = state
      for (const handler of connHandlers) handler()
    },
  }
  let produceHandler: ProduceHandler | undefined
  let connectHandler: ConnectHandler | undefined
  const connHandlers = new Set<ConnStateHandler>()

  transport.on.mockImplementation((event: string, handler: unknown) => {
    if (event === 'produce') produceHandler = handler as ProduceHandler
    if (event === 'connect') connectHandler = handler as ConnectHandler
    if (event === 'connectionstatechange') connHandlers.add(handler as ConnStateHandler)
  })
  transport.removeListener.mockImplementation((event: string, handler: unknown) => {
    if (event === 'connectionstatechange') connHandlers.delete(handler as ConnStateHandler)
  })

  transport.produce.mockImplementation(async (opts: { track: MediaStreamTrack; appData: object }) => {
    const producer: MockProducer = {
      id: `producer-${opts.track.id}`,
      kind: opts.track.kind,
      track: opts.track,
      closed: false,
      close: vi.fn(() => {
        producer.closed = true
      }),
    }
    await new Promise<void>((resolve, reject) => {
      if (!produceHandler) {
        reject(new Error('produce handler missing'))
        return
      }
      produceHandler(
        { kind: opts.track.kind, rtpParameters: {}, appData: opts.appData },
        ({ id: pid }) => {
          producer.id = pid
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

  return transport
}

const mockRecvTransport = {
  connectionState: 'connected' as const,
  on: vi.fn(),
  removeListener: vi.fn(),
  consume: vi.fn(),
  close: vi.fn(),
}

vi.mock('mediasoup-client', () => {
  class Device {
    rtpCapabilities = {}
    async load() {
      return undefined
    }
    createSendTransport(opts: { id: string }) {
      const existing = sendTransportsById.get(opts.id)
      if (existing) return existing
      const transport = createMockSendTransport(opts.id)
      sendTransportsById.set(opts.id, transport)
      return transport
    }
    createRecvTransport(opts: { id: string }) {
      void opts
      return mockRecvTransport
    }
  }
  return { Device, default: { Device } }
})

import { connectSfuUnifiedSession, type SfuSessionEndReason } from './mediasoupSharing'

class MockMediaStream {
  private tracks: MediaStreamTrack[] = []

  constructor(tracks?: MediaStreamTrack[]) {
    if (tracks) this.tracks = [...tracks]
  }

  getTracks(): MediaStreamTrack[] {
    return this.tracks
  }
}

function mockTrack(kind: 'audio' | 'video', id: string): MediaStreamTrack {
  return { kind, id } as MediaStreamTrack
}

function mockStream(tracks: MediaStreamTrack[]): MediaStream {
  return new MockMediaStream(tracks) as unknown as MediaStream
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

describe('connectSfuUnifiedSession per-class send transport isolation (#247)', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    createdProducers.length = 0
    sendTransportsById.clear()
    transportCreateCount = 0
    mockRecvTransport.on.mockReset()
    mockRecvTransport.removeListener.mockReset()
    mockRecvTransport.consume.mockReset()
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
    vi.stubGlobal('MediaStream', MockMediaStream as unknown as typeof MediaStream)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('allocates distinct send transports for host_screen and participant_av', async () => {
    const session = await connectProducerSession()
    const screenTrack = mockTrack('video', 'screen-iso')
    const avTrack = mockTrack('audio', 'mic-iso')

    await session.publishStream(mockStream([screenTrack]), 'host_screen')
    await session.publishStream(mockStream([avTrack]), 'participant_av')

    const sendIds = [...sendTransportsById.keys()].filter((id) => id.startsWith('send-transport-'))
    expect(sendIds).toHaveLength(2)
    expect(session.getProducerCount()).toBe(2)
    session.close()
  })

  it('participant_av partial unpublish leaves host_screen producers intact', async () => {
    const session = await connectProducerSession()
    const screenTrack = mockTrack('video', 'screen-survive')
    const audioTrack = mockTrack('audio', 'mic-survive')
    const videoTrack = mockTrack('video', 'cam-survive')

    await session.publishStream(mockStream([screenTrack]), 'host_screen')
    await session.publishStream(mockStream([audioTrack, videoTrack]), 'participant_av')

    const screenProducer = createdProducers.find((p) => p.track.id === 'screen-survive')
    expect(screenProducer).toBeDefined()
    expect(session.getProducerCount()).toBe(3)

    session.unpublishProducerKind('participant_av', 'video')

    expect(screenProducer!.close).not.toHaveBeenCalled()
    expect(session.getProducerCount()).toBe(2)
    session.close()
  })

  it('class-scoped send transport failure does not end the session', async () => {
    let sessionEndReason: SfuSessionEndReason | undefined
    const onMediaError = vi.fn()

    const session = await connectSfuUnifiedSession({
      wsBaseUrl: 'ws://127.0.0.1:3000',
      token: 'tok',
      tokenRole: 'producer',
      getIceServers: async () => [],
      onRemoteStream: () => undefined,
      onMediaError,
    })
    await session.ready
    void session.sessionEnded.then((reason) => {
      sessionEndReason = reason
    })

    const screenTrack = mockTrack('video', 'screen-stable')
    const avTrack = mockTrack('audio', 'mic-fail')
    await session.publishStream(mockStream([screenTrack]), 'host_screen')
    await session.publishStream(mockStream([avTrack]), 'participant_av')

    const avTransport = [...sendTransportsById.values()].find((t) => t.id !== 'recv-transport' && t.produce.mock.calls.some(
      (call) => (call[0] as { track: MediaStreamTrack }).track.id === 'mic-fail',
    ))
    expect(avTransport).toBeDefined()

    avTransport!.emitConnectionState('failed')
    await Promise.resolve()

    expect(onMediaError).toHaveBeenCalledWith(
      'transport_failed',
      expect.stringContaining('participant_av'),
    )
    expect(sessionEndReason).toBeUndefined()

    const screenProducer = createdProducers.find((p) => p.track.id === 'screen-stable')
    expect(screenProducer!.close).not.toHaveBeenCalled()
    expect(session.getProducerCount()).toBe(1)

    session.close()
  })
})
