import { getPublicApiBaseUrl } from '../config/apiBaseUrl'
import { FAN_AUTH_REQUIRED_CLIENT, requireFanAccessToken } from './requireFanAccessToken'

export type DmTextMessage = {
  messageId: string
  senderSub: string
  kind: 'text'
  body: string
  sentAt: number
}

export type DmGifMessage = {
  messageId: string
  senderSub: string
  kind: 'gif'
  body: string
  giphyId: string
  renditionUrl: string
  title?: string
  width?: number
  height?: number
  sentAt: number
}

export type DmMessage = DmTextMessage | DmGifMessage

export type DmHistoryPage = {
  messages: DmMessage[]
  nextCursor: string | null
}

export type DmApiFailure = {
  ok: false
  status: number
  code?: string
  error?: string
}

export type DmTextSendRequest = {
  messageId: string
  kind: 'text'
  body: string
}

export type DmGifSendRequest = {
  messageId: string
  kind: 'gif'
  body?: string
  giphyId: string
  renditionUrl: string
  title?: string
  width?: number
  height?: number
}

export type DmSendRequest = DmTextSendRequest | DmGifSendRequest

export type DmTextSendResponse = {
  pairKey: string
  messageId: string
  senderSub: string
  kind: 'text'
  body: string
  sentAt: number
}

export type DmGifSendResponse = {
  pairKey: string
  messageId: string
  senderSub: string
  kind: 'gif'
  body: string
  giphyId: string
  renditionUrl: string
  title?: string
  width?: number
  height?: number
  sentAt: number
}

export type DmSendResponse = DmTextSendResponse | DmGifSendResponse

export type DmSendResult = { ok: true; message: DmSendResponse } | DmApiFailure

function parseDmMessage(entry: unknown): DmMessage | null {
  if (typeof entry !== 'object' || entry === null) return null
  const record = entry as Record<string, unknown>
  const messageId = typeof record.messageId === 'string' ? record.messageId : ''
  const senderSub = typeof record.senderSub === 'string' ? record.senderSub : ''
  const kind = record.kind === 'text' || record.kind === 'gif' ? record.kind : null
  const body = typeof record.body === 'string' ? record.body : ''
  const sentAt = typeof record.sentAt === 'number' && Number.isFinite(record.sentAt) ? record.sentAt : NaN
  if (!messageId || !senderSub || !kind || !Number.isFinite(sentAt)) return null
  if (kind === 'text') {
    if (!body) return null
    return { messageId, senderSub, kind, body, sentAt }
  }
  const giphyId = typeof record.giphyId === 'string' ? record.giphyId : ''
  const renditionUrl = typeof record.renditionUrl === 'string' ? record.renditionUrl : ''
  if (!giphyId || !renditionUrl) return null
  const title = typeof record.title === 'string' && record.title.trim() !== '' ? record.title : undefined
  const width = typeof record.width === 'number' && Number.isFinite(record.width) ? record.width : undefined
  const height = typeof record.height === 'number' && Number.isFinite(record.height) ? record.height : undefined
  return {
    messageId,
    senderSub,
    kind,
    body,
    giphyId,
    renditionUrl,
    ...(title !== undefined ? { title } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    sentAt,
  }
}

async function parseDmFailure(res: Response): Promise<DmApiFailure> {
  let code: string | undefined
  let error: string | undefined
  try {
    const json = (await res.json()) as { code?: unknown; error?: unknown }
    code = typeof json.code === 'string' ? json.code : undefined
    error = typeof json.error === 'string' ? json.error : undefined
  } catch {
    // ignore parse errors
  }
  return { ok: false, status: res.status, code, error }
}

export type EnsureDmThreadResult =
  | { ok: true; pairKey: string; peerSub: string; status: string }
  | DmApiFailure

export async function ensureDmThread(
  _accessToken: string,
  peerSub: string,
  signal?: AbortSignal,
): Promise<EnsureDmThreadResult> {
  const accessToken = requireFanAccessToken()
  if (!accessToken) {
    return FAN_AUTH_REQUIRED_CLIENT
  }

  const base = getPublicApiBaseUrl()
  if (!base) {
    return { ok: false, status: 0, error: 'API base URL not configured' }
  }

  const res = await fetch(`${base}/v1/dm/threads/${encodeURIComponent(peerSub)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  })

  if (!res.ok) {
    return parseDmFailure(res)
  }

  const json = (await res.json()) as { pairKey?: unknown; peerSub?: unknown; status?: unknown }
  const pairKey = typeof json.pairKey === 'string' ? json.pairKey : ''
  const resolvedPeerSub = typeof json.peerSub === 'string' ? json.peerSub : peerSub
  const status = typeof json.status === 'string' ? json.status : 'open'
  if (!pairKey) {
    return { ok: false, status: res.status, error: 'Unexpected response from server' }
  }
  return { ok: true, pairKey, peerSub: resolvedPeerSub, status }
}

export type FetchDmMessagesResult = { ok: true; page: DmHistoryPage } | DmApiFailure

export async function fetchDmMessages(
  _accessToken: string,
  pairKey: string,
  signal?: AbortSignal,
): Promise<FetchDmMessagesResult> {
  const accessToken = requireFanAccessToken()
  if (!accessToken) {
    return FAN_AUTH_REQUIRED_CLIENT
  }

  const base = getPublicApiBaseUrl()
  if (!base) {
    return { ok: false, status: 0, error: 'API base URL not configured' }
  }

  const res = await fetch(`${base}/v1/dm/threads/${encodeURIComponent(pairKey)}/messages`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  })

  if (!res.ok) {
    return parseDmFailure(res)
  }

  const json = (await res.json()) as { messages?: unknown; nextCursor?: unknown }
  const messages = Array.isArray(json.messages)
    ? json.messages.map(parseDmMessage).filter((entry): entry is DmMessage => Boolean(entry))
    : []
  const nextCursor = typeof json.nextCursor === 'string' ? json.nextCursor : null
  return { ok: true, page: { messages, nextCursor } }
}

export type MarkDmReadResult = { ok: true; hasUnread: boolean } | DmApiFailure

export async function markDmRead(
  _accessToken: string,
  pairKey: string,
  lastReadSentAt: number,
  lastReadMessageId: string,
  signal?: AbortSignal,
): Promise<MarkDmReadResult> {
  const accessToken = requireFanAccessToken()
  if (!accessToken) {
    return FAN_AUTH_REQUIRED_CLIENT
  }

  const base = getPublicApiBaseUrl()
  if (!base) {
    return { ok: false, status: 0, error: 'API base URL not configured' }
  }

  const res = await fetch(`${base}/v1/dm/threads/${encodeURIComponent(pairKey)}/read`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ lastReadSentAt, lastReadMessageId }),
    signal,
  })

  if (!res.ok) {
    return parseDmFailure(res)
  }

  const json = (await res.json()) as { hasUnread?: unknown }
  const hasUnread = typeof json.hasUnread === 'boolean' ? json.hasUnread : false
  return { ok: true, hasUnread }
}

export async function postDmMessage(
  _accessToken: string,
  pairKey: string,
  payload: DmSendRequest,
  signal?: AbortSignal,
): Promise<DmSendResult> {
  const accessToken = requireFanAccessToken()
  if (!accessToken) {
    return FAN_AUTH_REQUIRED_CLIENT
  }

  const base = getPublicApiBaseUrl()
  if (!base) {
    return { ok: false, status: 0, error: 'API base URL not configured' }
  }

  const path = `/v1/dm/threads/${encodeURIComponent(pairKey)}/messages`
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  })

  if (!res.ok) {
    return parseDmFailure(res)
  }

  const message = (await res.json()) as DmSendResponse
  return { ok: true, message }
}
