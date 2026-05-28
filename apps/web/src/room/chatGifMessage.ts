import { parseInboundChatMessageId } from './chatMessageId'

const CHAT_GIF_TITLE_MAX = 200
const CHAT_GIF_DIMENSION_MAX = 4096

export type InboundChatGifLine = {
  messageId: string
  sessionId: string
  giphyId: string
  renditionUrl: string
  title?: string
  width?: number
  height?: number
  ts: number
  displayName?: string
  avatarUrl?: string
}

function parseOptionalTitle(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.length > CHAT_GIF_TITLE_MAX) return undefined
  return trimmed
}

function parseOptionalDimension(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0 || raw > CHAT_GIF_DIMENSION_MAX) {
    return undefined
  }
  return raw
}

export function parseInboundChatGifMessage(data: Record<string, unknown>): InboundChatGifLine | null {
  if (typeof data.sessionId !== 'string') return null

  const messageId = parseInboundChatMessageId(data.messageId)
  if (messageId === null) return null

  const giphyId = typeof data.giphyId === 'string' ? data.giphyId.trim() : ''
  if (giphyId === '') return null

  const renditionUrl = typeof data.renditionUrl === 'string' ? data.renditionUrl.trim() : ''
  if (renditionUrl === '') return null

  const ts = typeof data.ts === 'number' ? data.ts : Date.now()
  const displayName =
    typeof data.displayName === 'string' && data.displayName.trim() !== ''
      ? data.displayName
      : undefined
  const avatarUrl =
    typeof data.avatarUrl === 'string' && data.avatarUrl.trim() !== '' ? data.avatarUrl.trim() : undefined

  const title = parseOptionalTitle(data.title)
  const width = parseOptionalDimension(data.width)
  const height = parseOptionalDimension(data.height)

  return {
    messageId,
    sessionId: data.sessionId,
    giphyId,
    renditionUrl,
    ts,
    ...(title !== undefined ? { title } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(displayName !== undefined ? { displayName } : {}),
    ...(avatarUrl !== undefined ? { avatarUrl } : {}),
  }
}
