import type { RoomMode } from '../../api/roomsApi'
import type { ChatLine } from '../roomPageTypes'
import { formatChatSystemText } from '../chatSystemLine'
import { isEmojiOnlyChatMessage } from '../chatEmojiDisplay'
import type { CastChatOverlayLine, CastPresentationSnapshot } from './castChannelProtocol'

export type BuildCastPresentationSnapshotInput = {
  roomMode: RoomMode
  youtubeVideoId: string | null | undefined
  isPublisher: boolean
  hasHostCaptureStream: boolean
  hasGuestRelayStream: boolean
  chat: ChatLine[]
  chatMemberLabels: Map<string, string>
}

function resolveStagePrimary(input: BuildCastPresentationSnapshotInput): CastPresentationSnapshot['stagePrimary'] {
  if (input.roomMode === 'videoChat') {
    return {
      kind: 'video_chat_grid',
      label: 'Participant cameras',
    }
  }

  if (input.isPublisher && input.hasHostCaptureStream) {
    return {
      kind: 'live_video_placeholder',
      label: 'Host shared stream',
    }
  }

  if (!input.isPublisher && input.hasGuestRelayStream) {
    return {
      kind: 'live_video_placeholder',
      label: 'Party video',
    }
  }

  const youtubeVideoId = input.youtubeVideoId?.trim()
  if (youtubeVideoId) {
    return {
      kind: 'youtube_embed',
      youtubeVideoId,
      label: 'Party video',
    }
  }

  return {
    kind: 'live_video_placeholder',
    label: 'Waiting for party video',
  }
}

function toOverlayLine(line: ChatLine, chatMemberLabels: Map<string, string>): CastChatOverlayLine | null {
  if (line.kind === 'system') {
    return {
      id: line.messageId,
      kind: 'system',
      text: formatChatSystemText(line.displayName, line.systemEvent),
    }
  }

  if (line.kind === 'gif') {
    const senderLabel = chatMemberLabels.get(line.sessionId) ?? line.displayName ?? 'Guest'
    return {
      id: line.messageId,
      kind: 'gif',
      text: `${senderLabel}: GIF`,
      senderLabel,
    }
  }

  const senderLabel = chatMemberLabels.get(line.sessionId) ?? line.displayName ?? 'Guest'
  const text = line.text.trim()
  if (!text) return null
  return {
    id: line.messageId,
    kind: 'text',
    text: isEmojiOnlyChatMessage(text) ? text : `${senderLabel}: ${text}`,
    senderLabel,
  }
}

export function buildCastPresentationSnapshot(
  input: BuildCastPresentationSnapshotInput,
): CastPresentationSnapshot {
  const messages = input.chat
    .map((line) => toOverlayLine(line, input.chatMemberLabels))
    .filter((line): line is CastChatOverlayLine => line !== null)

  return {
    roomMode: input.roomMode,
    stagePrimary: resolveStagePrimary(input),
    chatOverlay: { messages },
  }
}
