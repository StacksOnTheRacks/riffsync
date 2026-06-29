import type { RoomMode } from '../../api/roomsApi'

export const RIFFSYNC_CAST_NAMESPACE = 'urn:x-cast:com.riffsync.presentation'

export type CastStartLifecycle = 'idle' | 'starting' | 'casting' | 'start_failed'

export type CastStagePrimaryKind = 'youtube_embed' | 'live_video_placeholder' | 'video_chat_grid'

export type CastChatOverlayLine = {
  id: string
  kind: 'text' | 'gif' | 'system'
  text: string
  senderLabel?: string
}

export type CastPresentationSnapshot = {
  roomMode: RoomMode
  stagePrimary: {
    kind: CastStagePrimaryKind
    youtubeVideoId?: string
    label?: string
  }
  chatOverlay: {
    messages: CastChatOverlayLine[]
  }
}

export type CastSenderOutboundMessage =
  | { type: 'presentation_snapshot'; snapshot: CastPresentationSnapshot }
  | { type: 'chat_overlay_update'; messages: CastChatOverlayLine[] }

export type CastReceiverOutboundMessage =
  | { type: 'render_confirmed' }
  | { type: 'render_failed'; reason?: string }

export function parseCastReceiverOutboundMessage(raw: unknown): CastReceiverOutboundMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const type = (raw as { type?: unknown }).type
  if (type === 'render_confirmed') return { type: 'render_confirmed' }
  if (type === 'render_failed') {
    const reason = (raw as { reason?: unknown }).reason
    return { type: 'render_failed', reason: typeof reason === 'string' ? reason : undefined }
  }
  return null
}
