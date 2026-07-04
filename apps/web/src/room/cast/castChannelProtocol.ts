import type { RoomMode } from '../../api/roomsApi'

export const RIFFSYNC_CAST_NAMESPACE = 'urn:x-cast:com.riffsync.presentation'
export const CAST_RECEIVER_RENDERED_SCHEMA_VERSION = 1

export type CastStartLifecycle =
  | 'idle'
  | 'launching'
  | 'session_pending_render'
  | 'casting'
  | 'stopping'
  | 'start_failed'
  | 'session_ended'
  | 'playback_blocked'
  | 'stop_failed'

export type CastStagePrimaryKind = 'youtube_embed' | 'live_stream' | 'live_video_placeholder' | 'video_chat_grid'

export type CastLivePlaybackConfig = {
  roomId: string
  sessionId: string
  apiBaseUrl?: string
}

export type CastChatOverlayLine = {
  id: string
  kind: 'text' | 'gif' | 'system'
  text: string
  senderLabel?: string
}

export type CastPresentationSnapshot = {
  snapshotId: string
  roomMode: RoomMode
  stagePrimary: {
    kind: CastStagePrimaryKind
    youtubeVideoId?: string
    label?: string
    livePlayback?: CastLivePlaybackConfig
  }
  chatOverlay: {
    messages: CastChatOverlayLine[]
  }
}

export type CastSenderOutboundMessage =
  | { type: 'presentation_snapshot'; snapshot: CastPresentationSnapshot }
  | { type: 'chat_overlay_update'; messages: CastChatOverlayLine[] }

export type CastReceiverRenderedAcknowledgement = {
  type: 'receiver_rendered'
  schemaVersion: number
  snapshotId: string
  stagePrimaryRendered: boolean
  chatOverlayRendered: boolean
}

export type CastReceiverOutboundMessage =
  | CastReceiverRenderedAcknowledgement
  | { type: 'render_failed'; reason?: string }

let castSnapshotIdCounter = 0

export function createCastSnapshotId(): string {
  castSnapshotIdCounter += 1
  return `cast-snapshot-${castSnapshotIdCounter}`
}

export function resetCastSnapshotIdCounterForTests(): void {
  castSnapshotIdCounter = 0
}

export function buildReceiverRenderedAcknowledgement(
  snapshotId: string,
): CastReceiverRenderedAcknowledgement {
  return {
    type: 'receiver_rendered',
    schemaVersion: CAST_RECEIVER_RENDERED_SCHEMA_VERSION,
    snapshotId,
    stagePrimaryRendered: true,
    chatOverlayRendered: true,
  }
}

export function isPositiveReceiverRenderedAcknowledgement(
  message: CastReceiverOutboundMessage,
  expectedSnapshotId: string | null,
): message is CastReceiverRenderedAcknowledgement {
  return (
    message.type === 'receiver_rendered' &&
    message.schemaVersion === CAST_RECEIVER_RENDERED_SCHEMA_VERSION &&
    typeof message.snapshotId === 'string' &&
    message.snapshotId.length > 0 &&
    expectedSnapshotId !== null &&
    message.snapshotId === expectedSnapshotId &&
    message.stagePrimaryRendered === true &&
    message.chatOverlayRendered === true
  )
}

export function parseCastReceiverOutboundMessage(
  raw: unknown,
): CastReceiverOutboundMessage | 'unrecognized' | null {
  if (!raw || typeof raw !== 'object') return null

  const type = (raw as { type?: unknown }).type
  if (type === 'render_failed') {
    const reason = (raw as { reason?: unknown }).reason
    return { type: 'render_failed', reason: typeof reason === 'string' ? reason : undefined }
  }

  if (type === 'receiver_rendered') {
    const schemaVersion = (raw as { schemaVersion?: unknown }).schemaVersion
    const snapshotId = (raw as { snapshotId?: unknown }).snapshotId
    const stagePrimaryRendered = (raw as { stagePrimaryRendered?: unknown }).stagePrimaryRendered
    const chatOverlayRendered = (raw as { chatOverlayRendered?: unknown }).chatOverlayRendered
    return {
      type: 'receiver_rendered',
      schemaVersion:
        schemaVersion === CAST_RECEIVER_RENDERED_SCHEMA_VERSION
          ? CAST_RECEIVER_RENDERED_SCHEMA_VERSION
          : (Number(schemaVersion) as typeof CAST_RECEIVER_RENDERED_SCHEMA_VERSION),
      snapshotId: typeof snapshotId === 'string' ? snapshotId : '',
      stagePrimaryRendered: stagePrimaryRendered === true ? true : (false as true),
      chatOverlayRendered: chatOverlayRendered === true ? true : (false as true),
    }
  }

  if (type !== undefined) return 'unrecognized'
  return null
}
