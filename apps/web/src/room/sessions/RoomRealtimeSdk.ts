/**
 * Narrow public realtime API for room sessions.
 *
 * Maintainer tooling: `realtimeDiagnostics.ts` (`?diag=1`, `window.riffsyncRealtimeDiag`) is
 * dev-only WS timeline counters and JWT probes. `getDiagnostics()` on this class is the
 * normative fan-visible / harness contract per `.ai/integration/api_contracts.md`.
 */

import type { RoomSnapshot } from '../../api/roomsApi'
import type { SfuConsumerTrackEvent } from '../sfu/mediasoupSharing'
import { ChatSession, type ChatSessionStatus } from './ChatSession'
import { SfuMediaSession, type SfuMediaSessionStatus } from './SfuMediaSession'
import { TheaterPlayback } from './TheaterPlayback'

export const DRAWER_LIFECYCLE_STATES = [
  'connected',
  'reconnecting',
  'degraded',
  'torn-down',
] as const

export type DrawerLifecycleState = (typeof DRAWER_LIFECYCLE_STATES)[number]

export type ChatDrawerDiagnostics = {
  state: DrawerLifecycleState
  lastErrorCode?: string
}

export type SfuSignalingDrawerDiagnostics = {
  state: DrawerLifecycleState
  lastErrorCode?: string
  role?: 'producer' | 'consumer'
  producerCount?: number
  consumerCount?: number
}

export type TheaterPlaybackDrawerDiagnostics = {
  state: DrawerLifecycleState
  lastErrorCode?: string
  audioContextState?: AudioContextState
}

export type RoomRealtimeDiagnostics = {
  roomId: string
  sessionId: string
  asOf: string
  drawers: {
    chat: ChatDrawerDiagnostics
    sfuSignaling: SfuSignalingDrawerDiagnostics
    theaterPlayback: TheaterPlaybackDrawerDiagnostics
  }
  activeErrorCodes: string[]
}

export type JoinOptions = {
  roomSnapshot: RoomSnapshot
  sessionId: string
  displayName?: string
  accessToken?: string | null
  wsUrl?: string
  apiBaseUrl?: string
  isHost?: boolean
  getIceServers?: () => Promise<RTCIceServer[]>
}

export type PublishAvOptions = {
  camera: boolean
  mic: boolean
}

export type HostScreenSubscribeHandlers = {
  onRemoteStream?: (stream: MediaStream | null) => void
}

export type ParticipantAvSubscribeHandlers = {
  onConsumerTrack?: (event: SfuConsumerTrackEvent) => void
  onConsumersClear?: () => void
}

export type SubscribeHandlers = {
  hostScreen?: HostScreenSubscribeHandlers
  participantAv?: ParticipantAvSubscribeHandlers
}

export function mapChatSessionStatusToDrawerState(status: ChatSessionStatus): DrawerLifecycleState {
  switch (status) {
    case 'open':
      return 'connected'
    case 'connecting':
      return 'reconnecting'
    case 'error':
      return 'degraded'
    case 'idle':
    case 'closed':
    default:
      return 'torn-down'
  }
}

export function mapSfuMediaSessionStatusToDrawerState(
  status: SfuMediaSessionStatus,
): DrawerLifecycleState {
  switch (status) {
    case 'open':
      return 'connected'
    case 'connecting':
    case 'reconnecting':
      return 'reconnecting'
    case 'error':
      return 'degraded'
    case 'idle':
    case 'closed':
    default:
      return 'torn-down'
  }
}

function collectActiveErrorCodes(
  drawers: RoomRealtimeDiagnostics['drawers'],
): string[] {
  const codes: string[] = []
  const maybePush = (code: string | undefined) => {
    if (code && !codes.includes(code)) codes.push(code)
  }
  maybePush(drawers.chat.lastErrorCode)
  maybePush(drawers.sfuSignaling.lastErrorCode)
  maybePush(drawers.theaterPlayback.lastErrorCode)
  return codes
}

/**
 * Framework-agnostic facade over ChatSession, SfuMediaSession, and TheaterPlayback.
 */
export class RoomRealtimeSdk {
  private roomId = ''
  private sessionId = ''
  private theaterLayoutActive = false
  private chatLastErrorCode: string | undefined
  private sfuLastErrorCode: string | undefined
  private theaterLastErrorCode: string | undefined

  private chat: ChatSession | null = null
  private sfu: SfuMediaSession | null = null
  private theater: TheaterPlayback | null = null

  private chatStatusUnsub: (() => void) | null = null
  private sfuStatusUnsub: (() => void) | null = null
  private sfuErrorUnsub: (() => void) | null = null
  private hostScreenStreamUnsub: (() => void) | null = null
  private participantAvTrackUnsub: (() => void) | null = null
  private participantAvClearUnsub: (() => void) | null = null

  join(roomId: string, options: JoinOptions): this {
    this.teardownModules({ intentional: false })

    this.roomId = roomId
    this.sessionId = options.sessionId
    this.theaterLayoutActive = options.roomSnapshot.roomMode === 'theater'

    this.chat = new ChatSession()
    this.sfu = new SfuMediaSession()
    this.theater = new TheaterPlayback()

    this.chatStatusUnsub = this.chat.onStatusChange((status) => {
      if (status === 'error' && !this.chatLastErrorCode) {
        this.chatLastErrorCode = 'CHAT_SEND_DROPPED'
      }
      if (status === 'open') {
        this.chatLastErrorCode = undefined
      }
    })

    this.sfuStatusUnsub = this.sfu.onStatusChange((status) => {
      if (status === 'error' && !this.sfuLastErrorCode) {
        this.sfuLastErrorCode = 'SIGNALING_TIMEOUT'
      }
      if (status === 'open') {
        this.sfuLastErrorCode = undefined
      }
    })

    this.sfuErrorUnsub = this.sfu.onError((message) => {
      if (message) {
        this.sfuLastErrorCode = 'SIGNALING_TIMEOUT'
      }
    })

    if (this.theaterLayoutActive) {
      this.theater.configure({
        enabled: true,
        isPublisher: options.isHost === true,
        avDisabled: options.roomSnapshot.avDisabled,
      })
      this.theater.attachSfuSession(this.sfu)
    }

    if (options.wsUrl) {
      this.chat.connect({
        url: options.wsUrl,
        roomId,
        sessionId: options.sessionId,
        displayName: options.displayName,
        accessToken: options.accessToken ?? null,
        enabled: true,
      })
    }

    if (options.apiBaseUrl) {
      this.sfu.connect({
        apiBaseUrl: options.apiBaseUrl,
        roomId,
        sessionId: options.sessionId,
        accessToken: options.accessToken ?? null,
        getIceServers: options.getIceServers ?? (async () => []),
        getHostScreenStream: () => null,
        enabled: true,
      })
    }

    return this
  }

  publishAv(options: PublishAvOptions): void {
    const sfu = this.sfu
    if (!sfu) return
    const av = sfu.participantAv
    if (options.camera) {
      void av.enableCamera()
    } else {
      av.disableCamera()
    }
    if (options.mic) {
      void av.enableMic()
    } else {
      av.disableMic()
    }
  }

  subscribe(handlers: SubscribeHandlers): void {
    const sfu = this.sfu
    if (!sfu) return

    this.hostScreenStreamUnsub?.()
    this.participantAvTrackUnsub?.()
    this.participantAvClearUnsub?.()

    if (handlers.hostScreen?.onRemoteStream) {
      this.hostScreenStreamUnsub = sfu.onRemoteStream(handlers.hostScreen.onRemoteStream)
    } else {
      this.hostScreenStreamUnsub = null
    }

    if (handlers.participantAv?.onConsumerTrack) {
      this.participantAvTrackUnsub = sfu.onConsumerTrack(handlers.participantAv.onConsumerTrack)
    } else {
      this.participantAvTrackUnsub = null
    }

    if (handlers.participantAv?.onConsumersClear) {
      this.participantAvClearUnsub = sfu.onParticipantAvConsumersClear(
        handlers.participantAv.onConsumersClear,
      )
    } else {
      this.participantAvClearUnsub = null
    }
  }

  getDiagnostics(): RoomRealtimeDiagnostics {
    const chatState = this.chat
      ? mapChatSessionStatusToDrawerState(this.chat.getStatus())
      : 'torn-down'
    const sfuState = this.sfu
      ? mapSfuMediaSessionStatusToDrawerState(this.sfu.getStatus())
      : 'torn-down'
    const theaterState: DrawerLifecycleState = this.theaterLayoutActive
      ? this.theater
        ? 'connected'
        : 'degraded'
      : 'torn-down'

    const drawers: RoomRealtimeDiagnostics['drawers'] = {
      chat: {
        state: chatState,
        ...(this.chatLastErrorCode ? { lastErrorCode: this.chatLastErrorCode } : {}),
      },
      sfuSignaling: {
        state: sfuState,
        ...(this.sfuLastErrorCode ? { lastErrorCode: this.sfuLastErrorCode } : {}),
      },
      theaterPlayback: {
        state: theaterState,
        ...(this.theaterLastErrorCode ? { lastErrorCode: this.theaterLastErrorCode } : {}),
      },
    }

    return {
      roomId: this.roomId,
      sessionId: this.sessionId,
      asOf: new Date().toISOString(),
      drawers,
      activeErrorCodes: collectActiveErrorCodes(drawers),
    }
  }

  teardown(): void {
    this.teardownModules({ intentional: true })
  }

  private teardownModules(opts: { intentional: boolean }): void {
    this.chatStatusUnsub?.()
    this.sfuStatusUnsub?.()
    this.sfuErrorUnsub?.()
    this.hostScreenStreamUnsub?.()
    this.participantAvTrackUnsub?.()
    this.participantAvClearUnsub?.()
    this.chatStatusUnsub = null
    this.sfuStatusUnsub = null
    this.sfuErrorUnsub = null
    this.hostScreenStreamUnsub = null
    this.participantAvTrackUnsub = null
    this.participantAvClearUnsub = null

    if (opts.intentional) {
      this.chat?.disconnect()
      this.sfu?.disconnect()
      this.theater?.dispose()
    }

    this.chat = null
    this.sfu = null
    this.theater = null
    this.theaterLayoutActive = false
    this.chatLastErrorCode = undefined
    this.sfuLastErrorCode = undefined
    this.theaterLastErrorCode = undefined

    if (opts.intentional) {
      this.roomId = ''
      this.sessionId = ''
    }
  }
}
