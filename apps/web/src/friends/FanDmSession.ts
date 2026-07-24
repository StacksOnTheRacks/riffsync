import { getPublicFanDmWsUrl } from '../config/fanDmWsUrl'
import { FAN_AUTH_CHANGED_EVENT, getFanAccessToken } from '../auth/fanTokens'
import { dmPushUnavailableError, dmSendDroppedError, type DmDrawerError } from './dmDrawerCodes'
import { postDmMessage, type DmSendRequest, type DmSendResponse } from './dmApi'

const PING_MS = 25_000
const SEND_RETRY_ATTEMPTS = 3
const SEND_RETRY_BASE_MS = 400

export type InboundDmMessage = {
  type: 'dm_message'
  schemaVersion: 1
  pairKey: string
  messageId: string
  senderSub: string
  kind: 'text'
  body: string
  sentAt: number
  displayName?: string
  avatarUrl?: string
}

export type FanDmSessionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export type FanDmSessionHandlers = {
  onInboundMessage?: (message: InboundDmMessage) => void
  onStatusChange?: (status: FanDmSessionStatus) => void
  onDrawerError?: (error: DmDrawerError) => void
}

function buildFanDmWsUrl(wsBase: string, accessToken: string, sessionId: string): string {
  const url = new URL(wsBase)
  url.searchParams.set('accessToken', accessToken)
  url.searchParams.set('sessionId', sessionId)
  return url.toString()
}

function parseInboundDmMessage(raw: unknown): InboundDmMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (record.type !== 'dm_message' || record.schemaVersion !== 1) return null
  const pairKey = typeof record.pairKey === 'string' ? record.pairKey : ''
  const messageId = typeof record.messageId === 'string' ? record.messageId : ''
  const senderSub = typeof record.senderSub === 'string' ? record.senderSub : ''
  const kind = record.kind === 'text' ? 'text' : null
  const body = typeof record.body === 'string' ? record.body : ''
  const sentAt = typeof record.sentAt === 'number' && Number.isFinite(record.sentAt) ? record.sentAt : NaN
  if (!pairKey || !messageId || !senderSub || !kind || !body || !Number.isFinite(sentAt)) {
    return null
  }
  const displayName = typeof record.displayName === 'string' ? record.displayName : undefined
  const avatarUrl = typeof record.avatarUrl === 'string' ? record.avatarUrl : undefined
  return {
    type: 'dm_message',
    schemaVersion: 1,
    pairKey,
    messageId,
    senderSub,
    kind,
    body,
    sentAt,
    ...(displayName ? { displayName } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}

/**
 * Fan DM push session — independent of room ChatSession / RoomRealtimeSdk lifecycle.
 */
export class FanDmSession {
  private ws: WebSocket | null = null
  private pingTimer: number | null = null
  private status: FanDmSessionStatus = 'idle'
  private readonly sessionId: string
  private readonly handlers: FanDmSessionHandlers
  private readonly handlerSubs = new Set<FanDmSessionHandlers>()

  constructor(handlers: FanDmSessionHandlers = {}, sessionId?: string) {
    this.handlers = handlers
    this.sessionId =
      sessionId ??
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `fan-dm-${Date.now()}`)
  }

  registerHandlers(handlers: FanDmSessionHandlers): () => void {
    this.handlerSubs.add(handlers)
    return () => {
      this.handlerSubs.delete(handlers)
    }
  }

  private emitInboundMessage(message: InboundDmMessage): void {
    this.handlers.onInboundMessage?.(message)
    for (const sub of this.handlerSubs) {
      sub.onInboundMessage?.(message)
    }
  }

  private emitStatusChange(status: FanDmSessionStatus): void {
    this.handlers.onStatusChange?.(status)
    for (const sub of this.handlerSubs) {
      sub.onStatusChange?.(status)
    }
  }

  private emitDrawerError(error: DmDrawerError): void {
    this.handlers.onDrawerError?.(error)
    for (const sub of this.handlerSubs) {
      sub.onDrawerError?.(error)
    }
  }

  getStatus(): FanDmSessionStatus {
    return this.status
  }

  isPushAvailable(): boolean {
    return this.status === 'open'
  }

  private setStatus(next: FanDmSessionStatus): void {
    if (this.status === next) return
    const wasOpen = this.status === 'open'
    this.status = next
    this.emitStatusChange(next)
    if (wasOpen && next !== 'open') {
      this.emitDrawerError(dmPushUnavailableError())
    }
  }

  connect(accessToken: string): void {
    const wsBase = getPublicFanDmWsUrl()
    if (!wsBase) {
      this.setStatus('error')
      this.emitDrawerError(dmPushUnavailableError(new Error('Fan DM WebSocket URL not configured')))
      return
    }

    this.disconnect()
    this.setStatus('connecting')

    const ws = new WebSocket(buildFanDmWsUrl(wsBase, accessToken, this.sessionId))
    this.ws = ws

    ws.onopen = () => {
      if (this.ws !== ws) return
      this.setStatus('open')
      this.startPing()
    }

    ws.onmessage = (event) => {
      if (this.ws !== ws) return
      try {
        const parsed = parseInboundDmMessage(JSON.parse(String(event.data)))
        if (parsed) {
          this.emitInboundMessage(parsed)
        }
      } catch {
        // ignore malformed push frames
      }
    }

    ws.onerror = () => {
      if (this.ws !== ws) return
      this.setStatus('error')
    }

    ws.onclose = () => {
      if (this.ws !== ws) return
      this.stopPing()
      this.setStatus('closed')
    }
  }

  disconnect(): void {
    this.stopPing()
    if (this.ws) {
      const socket = this.ws
      this.ws = null
      socket.close()
    }
    this.setStatus('idle')
  }

  async sendMessage(accessToken: string, pairKey: string, payload: DmSendRequest): Promise<DmSendResponse | null> {
    if (!this.isPushAvailable()) {
      this.emitDrawerError(dmPushUnavailableError())
    }

    let lastFailure: unknown
    for (let attempt = 0; attempt < SEND_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const result = await postDmMessage(accessToken, pairKey, payload)
        if (result.ok) {
          return result.message
        }
        if (result.status >= 400 && result.status < 500 && result.status !== 429) {
          this.emitDrawerError(dmSendDroppedError(result))
          return null
        }
        lastFailure = result
      } catch (err) {
        lastFailure = err
      }
      if (attempt < SEND_RETRY_ATTEMPTS - 1) {
        await sleep(SEND_RETRY_BASE_MS * 2 ** attempt)
      }
    }

    this.emitDrawerError(dmSendDroppedError(lastFailure))
    return null
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = globalThis.setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      this.ws.send(JSON.stringify({ action: 'ping' }))
    }, PING_MS) as unknown as number
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      globalThis.clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }
}

let sharedSession: FanDmSession | null = null

export function getSharedFanDmSession(handlers?: FanDmSessionHandlers): FanDmSession {
  if (!sharedSession) {
    sharedSession = new FanDmSession(handlers)
  }
  return sharedSession
}

export function syncSharedFanDmSessionWithAuth(): void {
  const token = getFanAccessToken()
  const session = getSharedFanDmSession()
  if (!token) {
    session.disconnect()
    return
  }
  if (session.getStatus() === 'open' || session.getStatus() === 'connecting') {
    return
  }
  session.connect(token)
}

export function installFanDmSessionAuthListener(): () => void {
  const onAuthChanged = () => syncSharedFanDmSessionWithAuth()
  window.addEventListener(FAN_AUTH_CHANGED_EVENT, onAuthChanged)
  syncSharedFanDmSessionWithAuth()
  return () => window.removeEventListener(FAN_AUTH_CHANGED_EVENT, onAuthChanged)
}
