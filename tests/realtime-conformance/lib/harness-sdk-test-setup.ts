import { vi } from 'vitest'
import NodeWebSocket from 'ws'
import { fetchSfuJoinToken } from '@web/api/webrtcSfuApi'
import { HARNESS_ROOM_ID } from '../lib/harness-constants.js'
import { loadHarnessEnv } from '../lib/harness-env.js'
import { mintHarnessSfuToken } from '../lib/sfu-peer.js'
import { harnessBaseSnapshot } from '@web/room/sessions/roomRealtimeSdkTestHelpers'

vi.mock('@web/room/realtimeDiagnostics', () => ({
  recordInboundWsMessage: vi.fn(),
  recordOutboundDropped: vi.fn(),
  recordOutboundSent: vi.fn(),
  recordWsClose: vi.fn(),
  recordWsConnectAttempt: vi.fn(),
  recordWsErrorEvent: vi.fn(),
  recordWsOpen: vi.fn(),
}))

vi.mock('@web/api/webrtcSfuApi', () => ({
  fetchSfuJoinToken: vi.fn(),
}))

vi.mock('@web/room/audio/theaterAudioMix', () => ({
  THEATER_AUDIO_GAIN: 1,
  shouldRouteConsumerAudio: (producerClass: string | undefined) =>
    producerClass === 'host_screen' || producerClass === 'participant_av',
  createTheaterAudioMix: vi.fn(() => ({
    dispose: vi.fn(),
    setAvDisabled: vi.fn(),
    setHostVideoElement: vi.fn(),
    onConsumerEvent: vi.fn(),
    resumeIfSuspended: vi.fn().mockResolvedValue(undefined),
    getAudioContextState: vi.fn().mockReturnValue('running'),
    watchAudioContextState: vi.fn((listener: (state: AudioContextState | undefined) => void) => {
      listener('running')
      return () => undefined
    }),
  })),
}))

export const sfuWebSockets: WebSocket[] = []

type WsListener = (ev?: unknown) => void

function createCompatWebSocketClass(): typeof WebSocket {
  const Base = NodeWebSocket as unknown as new (
    url: string | URL,
    protocols?: string | string[],
  ) => WebSocket

  class CompatWebSocket extends Base {
    private listeners = new Map<string, Set<WsListener>>()

    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols)
      const href = String(url)
      if (href.includes('127.0.0.1:3000') || href.includes('token=')) {
        sfuWebSockets.push(this)
      }

      super.on('open', () => this.dispatch('open'))
      super.on('message', (data) => this.dispatch('message', { data }))
      super.on('close', (code: number, reason: Buffer) =>
        this.dispatch('close', { code, reason: reason.toString() }),
      )
      super.on('error', () => this.dispatch('error'))
    }

    addEventListener(type: string, listener: WsListener, options?: { once?: boolean }): void {
      const wrapped: WsListener = options?.once
        ? (ev) => {
            this.removeEventListener(type, wrapped)
            listener(ev)
          }
        : listener
      const set = this.listeners.get(type) ?? new Set()
      set.add(wrapped)
      this.listeners.set(type, set)
    }

    removeEventListener(type: string, listener: WsListener): void {
      this.listeners.get(type)?.delete(listener)
    }

    private dispatch(type: string, ev?: unknown): void {
      for (const fn of this.listeners.get(type) ?? []) fn(ev)
    }

    set onopen(fn: (() => void) | null) {
      if (fn) this.addEventListener('open', fn)
    }

    set onerror(fn: (() => void) | null) {
      if (fn) this.addEventListener('error', fn)
    }

    set onmessage(fn: ((ev: MessageEvent) => void) | null) {
      if (fn) {
        this.addEventListener('message', (ev) => fn(ev as MessageEvent))
      }
    }
  }

  const Cls = CompatWebSocket as unknown as typeof WebSocket
  for (const [key, value] of [
    ['OPEN', 1],
    ['CONNECTING', 0],
    ['CLOSING', 2],
    ['CLOSED', 3],
  ] as const) {
    Object.defineProperty(Cls, key, { value, configurable: true })
  }
  return Cls
}

export function installSfuWebSocketTracker(): void {
  sfuWebSockets.length = 0
  const TrackedWebSocket = createCompatWebSocketClass()
  vi.stubGlobal('WebSocket', TrackedWebSocket)
}

export function mockHarnessSfuTokenFetch(): void {
  vi.mocked(fetchSfuJoinToken).mockImplementation(async (_apiBase, _roomId, _sessionId) =>
    mintHarnessSfuToken('consumer', _sessionId),
  )
}

export function harnessJoinOptions(roomWsUrl: string, sessionId: string) {
  const env = loadHarnessEnv()
  return {
    roomSnapshot: harnessBaseSnapshot,
    sessionId,
    wsUrl: roomWsUrl,
    apiBaseUrl: 'https://api.harness.test',
    getIceServers: env.getIceServers,
    isHost: false,
  }
}

export function closeLatestSfuWebSocket(): WebSocket | null {
  const ws = sfuWebSockets.at(-1) ?? null
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close(1006, 'harness-sfu-drop')
  }
  return ws
}

export { HARNESS_ROOM_ID, harnessBaseSnapshot }
