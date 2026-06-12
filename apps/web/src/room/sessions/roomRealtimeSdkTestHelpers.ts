/**
 * Shared RoomRealtimeSdk test fixtures for unit tests and future
 * tests/realtime-conformance harness steps 5-6 (drawer reconnect isolation).
 *
 * Assertion contract mirrors `.ai/runtime/lifecycle_shutdown.md` and
 * `.ai/operations/build_packaging.md` harness steps 5-6.
 */

import { expect, vi } from 'vitest'
import type { RoomSnapshot } from '../../api/roomsApi'
import type { RealtimeDrawerError } from '../realtimeDrawerErrors'
import { ChatSession } from './ChatSession'
import { SfuMediaSession } from './SfuMediaSession'
import {
  RoomRealtimeSdk,
  type RoomRealtimeDiagnostics,
} from './RoomRealtimeSdk'

export const harnessBaseSnapshot: RoomSnapshot = {
  roomId: 'room-abc',
  hostSub: 'host-sub',
  catalogEpisodeId: 'ep-1',
  youtubeVideoId: 'yt-1',
  playbackExpectation: 'free',
  visibility: 'public',
  lastActivityAt: 1,
  version: 1,
  roomMode: 'theater',
  avDisabled: false,
  broadcastCaptureActive: false,
}

export type HarnessJoinOptions = {
  sessionId?: string
  isHost?: boolean
  roomMode?: RoomSnapshot['roomMode']
}

/** Bootstrap chat + SFU to connected for harness step 5/6 preconditions. */
export async function joinHealthySdk(
  options: HarnessJoinOptions = {},
): Promise<RoomRealtimeSdk> {
  mockChatConnectOpensImmediately()
  mockSfuConnectOpensImmediately()

  const sdk = new RoomRealtimeSdk()
  sdk.join('room-abc', {
    roomSnapshot: {
      ...harnessBaseSnapshot,
      ...(options.roomMode ? { roomMode: options.roomMode } : {}),
    },
    sessionId: options.sessionId ?? 'sess-harness',
    wsUrl: 'wss://ws.test',
    apiBaseUrl: 'https://api.test',
    getIceServers: async () => [{ urls: 'stun:stun.test' }],
    isHost: options.isHost,
  })

  await vi.waitFor(() => {
    const diag = sdk.getDiagnostics()
    expect(diag.drawers.chat.state).toBe('connected')
    expect(diag.drawers.sfuSignaling.state).toBe('connected')
  })

  return sdk
}

export function mockChatConnectOpensImmediately(): void {
  vi.spyOn(ChatSession.prototype, 'connect').mockImplementation(function (this: ChatSession) {
    ;(this as unknown as { setStatus: (status: string) => void }).setStatus('open')
    ;(this as unknown as { setLifecycleState: (status: string) => void }).setLifecycleState(
      'connected',
    )
  })
}

export function mockSfuConnectOpensImmediately(): void {
  vi.spyOn(SfuMediaSession.prototype, 'connect').mockImplementation(function (this: SfuMediaSession) {
    ;(this as unknown as { setStatus: (status: string) => void }).setStatus('open')
    ;(this as unknown as { setLifecycleState: (status: string) => void }).setLifecycleState(
      'connected',
    )
  })
}

export function getChatSession(sdk: RoomRealtimeSdk): ChatSession {
  return (sdk as unknown as { chat: ChatSession }).chat
}

export function getSfuSession(sdk: RoomRealtimeSdk): SfuMediaSession {
  return (sdk as unknown as { sfu: SfuMediaSession }).sfu
}

export function setChatLifecycle(sdk: RoomRealtimeSdk, state: string): void {
  const chat = getChatSession(sdk)
  ;(chat as unknown as { setLifecycleState: (s: string) => void }).setLifecycleState(state)
}

export function setSfuLifecycle(sdk: RoomRealtimeSdk, state: string): void {
  const sfu = getSfuSession(sdk)
  ;(sfu as unknown as { setLifecycleState: (s: string) => void }).setLifecycleState(state)
}

/** Drive SFU drawer error wiring the same path production uses via `onDrawerError`. */
export function emitSfuDrawerError(sdk: RoomRealtimeSdk, error: RealtimeDrawerError): void {
  const sfu = getSfuSession(sdk)
  ;(sfu as unknown as { emitDrawerError: (e: RealtimeDrawerError | null) => void }).emitDrawerError(
    error,
  )
}

export function emitShareStateStopped(sdk: RoomRealtimeSdk, roomId = 'room-abc'): void {
  emitShareState(sdk, 'stopped', roomId)
}

export function emitShareStateStarted(sdk: RoomRealtimeSdk, roomId = 'room-abc'): void {
  emitShareState(sdk, 'started', roomId)
}

function emitShareState(
  sdk: RoomRealtimeSdk,
  state: 'started' | 'stopped',
  roomId: string,
): void {
  const chat = getChatSession(sdk)
  const shareListeners = (chat as unknown as {
    shareStateListeners: Set<(ev: { roomId: string; state: unknown }) => void>
  }).shareStateListeners
  for (const listener of shareListeners) {
    listener({ roomId, state })
  }
}

/** Harness step 5/6: sibling drawer must stay connected while the other plane is in outage. */
export function assertSiblingDrawerStaysConnected(
  diag: RoomRealtimeDiagnostics,
  siblingDrawer: 'chat' | 'sfuSignaling',
): void {
  expect(diag.drawers[siblingDrawer].state).toBe('connected')
  expect(diag.drawers[siblingDrawer].state).not.toBe('torn-down')
}

/** Harness step 5/6: failed drawer reports reconnecting during outage, connected after recovery. */
export function assertDrawerReconnectCycle(
  duringOutage: RoomRealtimeDiagnostics,
  afterRecovery: RoomRealtimeDiagnostics,
  affectedDrawer: 'chat' | 'sfuSignaling',
): void {
  expect(duringOutage.drawers[affectedDrawer].state).toBe('reconnecting')
  expect(afterRecovery.drawers[affectedDrawer].state).toBe('connected')
}

/** share_state stopped: no drawer may enter torn-down (partial SFU detach only). */
export function assertNoDrawerTornDown(diag: RoomRealtimeDiagnostics): void {
  const drawerKeys = ['chat', 'sfuSignaling', 'theaterPlayback'] as const
  for (const key of drawerKeys) {
    expect(diag.drawers[key].state).not.toBe('torn-down')
  }
}

/** Minimal WebSocket stub for harness step 5 chat-only outage (#202). */
export class HarnessChatMockWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSING = 2
  static CLOSED = 3
  static instances: HarnessChatMockWebSocket[] = []

  readyState = 0
  private listeners = new Map<string, Array<(ev?: unknown) => void>>()

  constructor(url: string) {
    void url
    HarnessChatMockWebSocket.instances.push(this)
  }

  send = vi.fn()

  addEventListener(type: string, fn: (ev?: unknown) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(fn)
    this.listeners.set(type, list)
  }

  close(): void {
    this.readyState = HarnessChatMockWebSocket.CLOSED
  }

  emit(type: string, ev?: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) fn(ev)
  }
}

export function installHarnessChatMockWebSocket(): void {
  HarnessChatMockWebSocket.instances = []
  vi.stubGlobal('WebSocket', HarnessChatMockWebSocket as unknown as typeof WebSocket)
  Object.assign(HarnessChatMockWebSocket, {
    OPEN: 1,
    CONNECTING: 0,
    CLOSING: 2,
    CLOSED: 3,
  })
}

export function openLatestHarnessChatSocket(): HarnessChatMockWebSocket {
  const ws = HarnessChatMockWebSocket.instances.at(-1)!
  ws.readyState = HarnessChatMockWebSocket.OPEN
  ws.emit('open')
  return ws
}

export function emitLatestHarnessChatSocketClose(code = 1006): HarnessChatMockWebSocket {
  const ws = HarnessChatMockWebSocket.instances.at(-1)!
  ws.emit('close', { code, reason: '' })
  return ws
}
