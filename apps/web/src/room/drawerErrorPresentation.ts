import {
  participantAvErrorMessage,
  type ParticipantAvErrorCode,
} from './av/participantAvErrors'
import type { DrawerLifecycleState } from './sessions/RoomRealtimeSdk'
import type {
  ChatDrawerDiagnostics,
  RoomRealtimeDiagnostics,
  SfuSignalingDrawerDiagnostics,
  TheaterPlaybackDrawerDiagnostics,
} from './sessions/RoomRealtimeSdk'
import {
  isRealtimeDrawerErrorCode,
  type RealtimeDrawerErrorCode,
} from './realtimeDrawerErrors'
import {
  resolveGuestVideoRelayStatusLine,
  resolveHostVideoRelayStatusLine,
  type GuestHostScreenFsm,
} from './sfu/sfuRelayStatusCopy'

/** Stable DOM anchors from `.ai/business_logic/error_state.md` Surface mapping (#141). */
export const RIFFSYNC_CHAT_DRAWER_STATUS_ID = 'riffsync-chat-drawer-status'
export const RIFFSYNC_VIDEO_RELAY_STATUS_ID = 'riffsync-video-relay-status'
export const RIFFSYNC_CHAT_COMPOSE_STATUS_ID = 'riffsync-chat-compose-status'
export const RIFFSYNC_AV_TOGGLE_STATUS_ID = 'riffsync-av-toggle-status'
export const RIFFSYNC_THEATER_AUDIO_STATUS_ID = 'riffsync-theater-audio-status'
export const RIFFSYNC_SFU_CONFIG_ALERT_ID = 'riffsync-sfu-config-alert'

const CONFIG_CLASS_SFU_CODES = new Set<RealtimeDrawerErrorCode>([
  'SFU_RELAY_URL_MISSING',
  'LOCAL_SFU_UNREACHABLE',
  'SFU_RELAY_UNREACHABLE',
])

const DRAWER_ERROR_COPY: Record<RealtimeDrawerErrorCode, string> = {
  CHAT_SEND_DROPPED: 'Message could not be sent. Check chat connection and try again.',
  CHAT_RECONNECTING: 'Reconnecting chat…',
  SIGNALING_TIMEOUT: 'Video relay is slow to connect. Waiting…',
  sfu_signaling_failed:
    'Video relay connection lost. Refresh or wait for automatic reconnect.',
  ICE_FAILED: 'Network connection failed. Check your network or VPN and try again.',
  TURN_RELAY_REQUIRED:
    'A relay connection is required but could not be established. Try again or check network settings.',
  PRODUCER_CLOSED: 'Remote video ended.',
  sfu_publish_rejected: 'Could not publish your camera/microphone. Try again in a moment.',
  PLAYBACK_AUDIO_BLOCKED:
    'Party audio is blocked. Tap to enable sound or check browser autoplay settings.',
  THEATER_AUDIO_SUSPENDED:
    'Party audio is paused. Click anywhere or press Enable sound to resume audio.',
  SFU_RELAY_URL_MISSING:
    'Video relay URL is missing. Set VITE_PUBLIC_SFU_WS_URL at build time or redeploy API so POST /v1/webrtc/sfu-token returns wsUrl.',
  LOCAL_SFU_UNREACHABLE:
    'Local video relay is not running. Run npm run media:local, then confirm curl -sSf http://127.0.0.1:3000/healthz.',
  SFU_RELAY_UNREACHABLE:
    'Video relay is unreachable. Check docs/sfu-deploy-checklist.md and /healthz on the signaling host.',
  SFU_TOKEN_DENIED: 'Video relay access was denied. Try again or refresh the page.',
  TRANSPORT_LIMIT_REACHED:
    'This session reached the video relay connection limit. Refresh the page or wait for others to leave.',
  CONSUMER_LIMIT_REACHED:
    'This session reached the video relay viewer limit. Refresh the page or wait for others to leave.',
}

const CHAT_DRAWER_LIFECYCLE_COPY: Partial<Record<DrawerLifecycleState, string>> = {
  reconnecting: 'Reconnecting chat…',
  degraded: 'Chat unavailable. Try refreshing the page.',
}

const SFU_DRAWER_LIFECYCLE_COPY: Partial<Record<DrawerLifecycleState, string>> = {
  reconnecting: 'Video relay reconnecting…',
  degraded: 'Video relay unavailable. Try refreshing the page.',
}

function appendDevCodeSuffix(message: string, code: string): string {
  if (import.meta.env.DEV) {
    return `${message} (code: ${code})`
  }
  return message
}

export function messageForDrawerError(code: RealtimeDrawerErrorCode): string {
  return appendDevCodeSuffix(DRAWER_ERROR_COPY[code], code)
}

export function messageForParticipantAvError(code: ParticipantAvErrorCode): string {
  return appendDevCodeSuffix(participantAvErrorMessage(code), code)
}

export function isConfigClassSfuDrawerError(code: string | undefined): code is RealtimeDrawerErrorCode {
  return code !== undefined && CONFIG_CLASS_SFU_CODES.has(code as RealtimeDrawerErrorCode)
}

export function resolveChatDrawerBanner(chat: ChatDrawerDiagnostics): string | null {
  if (chat.lastErrorCode && isRealtimeDrawerErrorCode(chat.lastErrorCode)) {
    if (chat.lastErrorCode === 'CHAT_SEND_DROPPED' || chat.lastErrorCode === 'CHAT_RECONNECTING') {
      return messageForDrawerError(chat.lastErrorCode)
    }
  }
  const lifecycleCopy = CHAT_DRAWER_LIFECYCLE_COPY[chat.state]
  if (lifecycleCopy) return lifecycleCopy
  return null
}

export function resolveChatComposeStatus(chat: ChatDrawerDiagnostics): {
  message: string | null
  disableSubmit: boolean
} {
  const unhealthy =
    chat.state === 'reconnecting' ||
    chat.state === 'degraded' ||
    chat.lastErrorCode === 'CHAT_SEND_DROPPED'

  if (chat.lastErrorCode === 'CHAT_SEND_DROPPED') {
    return {
      message: messageForDrawerError('CHAT_SEND_DROPPED'),
      disableSubmit: true,
    }
  }

  if (chat.state === 'reconnecting' || chat.state === 'degraded') {
    const lifecycleCopy = CHAT_DRAWER_LIFECYCLE_COPY[chat.state]
    return {
      message: lifecycleCopy ?? null,
      disableSubmit: true,
    }
  }

  return { message: null, disableSubmit: unhealthy }
}

function resolveSfuDrawerErrorLine(
  sfu: SfuSignalingDrawerDiagnostics,
): string | null {
  if (sfu.lastErrorCode && isRealtimeDrawerErrorCode(sfu.lastErrorCode)) {
    if (sfu.lastErrorCode === 'sfu_publish_rejected') {
      return null
    }
    return messageForDrawerError(sfu.lastErrorCode)
  }
  return SFU_DRAWER_LIFECYCLE_COPY[sfu.state] ?? null
}

export function resolveVideoRelayStatusLine(opts: {
  sfu: SfuSignalingDrawerDiagnostics
  guestShareFsm?: GuestHostScreenFsm
  isPublisher: boolean
}): string | null {
  const drawerLine = resolveSfuDrawerErrorLine(opts.sfu)
  if (drawerLine) return drawerLine

  if (opts.isPublisher) {
    return resolveHostVideoRelayStatusLine(null)
  }

  return resolveGuestVideoRelayStatusLine({
    sfuRelayError: null,
    guestShareFsm: opts.guestShareFsm ?? 'idle',
  })
}

export function resolveSfuConfigAlert(sfu: SfuSignalingDrawerDiagnostics): string | null {
  if (!sfu.lastErrorCode || !isConfigClassSfuDrawerError(sfu.lastErrorCode)) {
    return null
  }
  return messageForDrawerError(sfu.lastErrorCode)
}

export function resolveTheaterAudioStatus(
  theater: TheaterPlaybackDrawerDiagnostics,
): string | null {
  if (!theater.lastErrorCode || !isRealtimeDrawerErrorCode(theater.lastErrorCode)) {
    return null
  }
  if (
    theater.lastErrorCode !== 'PLAYBACK_AUDIO_BLOCKED' &&
    theater.lastErrorCode !== 'THEATER_AUDIO_SUSPENDED'
  ) {
    return null
  }
  return messageForDrawerError(theater.lastErrorCode)
}

export function selectDrawerPresentation(diagnostics: RoomRealtimeDiagnostics, opts: {
  guestShareFsm: GuestHostScreenFsm
  isPublisher: boolean
}): {
  chatDrawerBanner: string | null
  chatComposeStatus: { message: string | null; disableSubmit: boolean }
  videoRelayStatus: string | null
  sfuConfigAlert: string | null
  theaterAudioStatus: string | null
} {
  return {
    chatDrawerBanner: resolveChatDrawerBanner(diagnostics.drawers.chat),
    chatComposeStatus: resolveChatComposeStatus(diagnostics.drawers.chat),
    videoRelayStatus: resolveVideoRelayStatusLine({
      sfu: diagnostics.drawers.sfuSignaling,
      guestShareFsm: opts.guestShareFsm,
      isPublisher: opts.isPublisher,
    }),
    sfuConfigAlert: resolveSfuConfigAlert(diagnostics.drawers.sfuSignaling),
    theaterAudioStatus: resolveTheaterAudioStatus(diagnostics.drawers.theaterPlayback),
  }
}
