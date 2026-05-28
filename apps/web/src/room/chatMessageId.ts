const CHAT_MESSAGE_ID_MAX_LEN = 64

export function createChatMessageId(): string {
  return crypto.randomUUID()
}

export function parseInboundChatMessageId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed.length > CHAT_MESSAGE_ID_MAX_LEN) return null
  return trimmed
}
