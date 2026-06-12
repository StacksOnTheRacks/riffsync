import type { RoomMode } from '../../api/roomsApi'
import { parseInboundChatGifMessage, type InboundChatGifLine } from '../chatGifMessage'
import { parseInboundChatMessageId } from '../chatMessageId'
import { parseInboundRoomMode } from '../roomMediaLifecycle'
import {
  chatSendDroppedError,
  type RealtimeDrawerError,
  type RealtimeDrawerErrorCode,
} from '../realtimeDrawerErrors'
import {
  recordInboundWsMessage,
  recordOutboundDropped,
  recordOutboundSent,
  recordWsClose,
  recordWsConnectAttempt,
  recordWsErrorEvent,
  recordWsOpen,
} from '../realtimeDiagnostics'
import { webrtcDebugEnabled, webrtcLog } from '../webrtcDebug'
import {
  CHAT_RECONNECT_BACKOFF_INITIAL_MS,
  chatLifecycleAfterFailedCycle,
  nextChatReconnectBackoffMs,
} from './drawerReconnectPolicy'

const PING_MS = 25_000

export type ChatSessionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

/** Normative drawer lifecycle for diagnostics (`execution_model.md`). */
export type ChatSessionLifecycleState =
  | 'connected'
  | 'reconnecting'
  | 'degraded'
  | 'torn-down'

export type ChatTextLine = {
  kind: 'text'
  messageId: string
  sessionId: string
  text: string
  ts: number
  displayName?: string
  avatarUrl?: string
}

export type ChatGifLine = InboundChatGifLine & { kind: 'gif' }

export type ChatReactionEvent = {
  messageId: string
  emoji: string
  action: 'add' | 'remove'
  sessionId: string
}

export type ChatPresenceMember = {
  sessionId: string
  displayName: string
  isHost: boolean
  avatarUrl?: string
}

export type PresenceEvent = {
  roomId: string
  members: ChatPresenceMember[]
}

export type ShareStateEvent = {
  roomId: string
  state: unknown
}

export type RoomModeEvent = {
  roomMode: RoomMode
}

export type AvDisabledEvent = {
  avDisabled: boolean
}

export type ChatInboundRouted =
  | { type: 'chat_text'; line: ChatTextLine }
  | { type: 'chat_gif'; line: ChatGifLine }
  | { type: 'chat_reaction'; event: ChatReactionEvent }
  | { type: 'presence'; event: PresenceEvent }
  | { type: 'share_state'; event: ShareStateEvent }
  | { type: 'room_mode'; event: RoomModeEvent }
  | { type: 'av_disabled'; event: AvDisabledEvent }

export type ChatSessionConnectOptions = {
  url: string
  roomId: string
  sessionId: string
  displayName?: string
  accessToken: string | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function parseInboundAvatarUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed !== '' ? trimmed : undefined
}

/** Pure inbound demux for chat control-plane frames (unit-tested without a live socket). */
export function routeInboundChatMessage(
  data: Record<string, unknown>,
  canonicalRoomId: string,
): ChatInboundRouted | null {
  const t = data.type
  if (t === 'chat' && typeof data.sessionId === 'string' && typeof data.text === 'string') {
    const messageId = parseInboundChatMessageId(data.messageId)
    if (messageId === null) return null
    const ts = typeof data.ts === 'number' ? data.ts : Date.now()
    const dn = typeof data.displayName === 'string' ? data.displayName : undefined
    const avatarUrl = parseInboundAvatarUrl(data.avatarUrl)
    return {
      type: 'chat_text',
      line: {
        kind: 'text',
        sessionId: data.sessionId,
        text: String(data.text),
        ts,
        messageId,
        ...(dn !== undefined && dn !== '' ? { displayName: dn } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      },
    }
  }
  if (t === 'chat_gif') {
    const gifLine = parseInboundChatGifMessage(data)
    if (gifLine === null) return null
    return { type: 'chat_gif', line: { kind: 'gif', ...gifLine } }
  }
  if (
    t === 'chat_reaction' &&
    typeof data.messageId === 'string' &&
    typeof data.emoji === 'string' &&
    (data.action === 'add' || data.action === 'remove') &&
    typeof data.sessionId === 'string'
  ) {
    const messageId = data.messageId.trim()
    const emoji = data.emoji.trim()
    if (messageId === '' || emoji === '') return null
    return {
      type: 'chat_reaction',
      event: {
        messageId,
        emoji,
        action: data.action,
        sessionId: data.sessionId,
      },
    }
  }
  if (t === 'presence' && typeof data.roomId === 'string') {
    if (data.roomId !== canonicalRoomId) return null
    const raw = data.members
    if (!Array.isArray(raw)) return null
    const members: ChatPresenceMember[] = []
    for (const m of raw) {
      if (!isRecord(m)) continue
      const sid = m.sessionId
      const dn = m.displayName
      if (typeof sid !== 'string' || typeof dn !== 'string') continue
      const avatarUrl = parseInboundAvatarUrl(m.avatarUrl)
      members.push({
        sessionId: sid,
        displayName: dn,
        isHost: Boolean(m.isHost),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      })
    }
    return { type: 'presence', event: { roomId: data.roomId, members } }
  }
  if (t === 'share_state' && typeof data.roomId === 'string') {
    if (data.roomId !== canonicalRoomId) return null
    return { type: 'share_state', event: { roomId: data.roomId, state: data.state } }
  }
  if (t === 'room_mode') {
    const nextMode = parseInboundRoomMode(data.roomMode)
    if (!nextMode) return null
    return { type: 'room_mode', event: { roomMode: nextMode } }
  }
  if (t === 'av_disabled' && typeof data.avDisabled === 'boolean') {
    return { type: 'av_disabled', event: { avDisabled: data.avDisabled } }
  }
  return null
}

type Listener<T> = (event: T) => void

export class ChatSession {
  private status: ChatSessionStatus = 'idle'
  private lifecycleState: ChatSessionLifecycleState = 'torn-down'
  private failedReconnectCycles = 0
  private lastErrorCode: RealtimeDrawerErrorCode | undefined
  private ws: WebSocket | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: number | null = null
  private backoffMs = CHAT_RECONNECT_BACKOFF_INITIAL_MS
  private cancelled = false
  private enabled = false
  private connectOptions: ChatSessionConnectOptions | null = null
  private pageHideListener: (() => void) | null = null

  private chatTextListeners = new Set<Listener<ChatTextLine>>()
  private chatGifListeners = new Set<Listener<ChatGifLine>>()
  private chatReactionListeners = new Set<Listener<ChatReactionEvent>>()
  private presenceListeners = new Set<Listener<PresenceEvent>>()
  private shareStateListeners = new Set<Listener<ShareStateEvent>>()
  private roomModeListeners = new Set<Listener<RoomModeEvent>>()
  private avDisabledListeners = new Set<Listener<AvDisabledEvent>>()
  private statusListeners = new Set<Listener<ChatSessionStatus>>()
  private lifecycleListeners = new Set<Listener<ChatSessionLifecycleState>>()
  private sendDroppedListeners = new Set<Listener<RealtimeDrawerError>>()

  getStatus(): ChatSessionStatus {
    return this.status
  }

  getLifecycleState(): ChatSessionLifecycleState {
    return this.lifecycleState
  }

  getLastErrorCode(): RealtimeDrawerErrorCode | undefined {
    return this.lastErrorCode
  }

  onChatText(listener: Listener<ChatTextLine>): () => void {
    this.chatTextListeners.add(listener)
    return () => this.chatTextListeners.delete(listener)
  }

  onChatGif(listener: Listener<ChatGifLine>): () => void {
    this.chatGifListeners.add(listener)
    return () => this.chatGifListeners.delete(listener)
  }

  onChatReaction(listener: Listener<ChatReactionEvent>): () => void {
    this.chatReactionListeners.add(listener)
    return () => this.chatReactionListeners.delete(listener)
  }

  onPresence(listener: Listener<PresenceEvent>): () => void {
    this.presenceListeners.add(listener)
    return () => this.presenceListeners.delete(listener)
  }

  /** Media policy: share_state fan-out (handlers own SFU / playback reactions). */
  onShareState(listener: Listener<ShareStateEvent>): () => void {
    this.shareStateListeners.add(listener)
    return () => this.shareStateListeners.delete(listener)
  }

  /** Media policy: room_mode fan-out. */
  onRoomMode(listener: Listener<RoomModeEvent>): () => void {
    this.roomModeListeners.add(listener)
    return () => this.roomModeListeners.delete(listener)
  }

  /** Media policy: av_disabled fan-out. */
  onAvDisabled(listener: Listener<AvDisabledEvent>): () => void {
    this.avDisabledListeners.add(listener)
    return () => this.avDisabledListeners.delete(listener)
  }

  onStatusChange(listener: Listener<ChatSessionStatus>): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  onLifecycleChange(listener: Listener<ChatSessionLifecycleState>): () => void {
    this.lifecycleListeners.add(listener)
    return () => this.lifecycleListeners.delete(listener)
  }

  /** Fired when outbound send is dropped because room WS is not open. */
  onSendDropped(listener: Listener<RealtimeDrawerError>): () => void {
    this.sendDroppedListeners.add(listener)
    return () => this.sendDroppedListeners.delete(listener)
  }

  connect(options: ChatSessionConnectOptions & { enabled?: boolean }): void {
    this.connectOptions = {
      url: options.url,
      roomId: options.roomId,
      sessionId: options.sessionId,
      displayName: options.displayName,
      accessToken: options.accessToken,
    }
    this.enabled = options.enabled !== false
    this.cancelled = false
    this.teardownSocket()
    if (!this.enabled || !options.url) {
      this.setStatus('idle')
      this.setLifecycleState('torn-down')
      return
    }
    this.backoffMs = CHAT_RECONNECT_BACKOFF_INITIAL_MS
    this.failedReconnectCycles = 0
    this.lastErrorCode = undefined
    this.attachPageHide()
    this.openSocket()
  }

  disconnect(): void {
    this.cancelled = true
    this.enabled = false
    this.detachPageHide()
    this.clearPing()
    this.clearReconnectTimer()
    this.ws?.close()
    this.ws = null
    this.failedReconnectCycles = 0
    this.lastErrorCode = undefined
    this.setStatus('idle')
    this.setLifecycleState('torn-down')
  }

  /** Returns false when the send is dropped (no queue while WS is not open). */
  send(payload: Record<string, unknown>): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      const readyState = ws?.readyState ?? -1
      recordOutboundDropped(payload, readyState)
      const drawerError = chatSendDroppedError({ readyState })
      this.lastErrorCode = drawerError.code
      for (const listener of this.sendDroppedListeners) listener(drawerError)
      return false
    }
    recordOutboundSent(payload)
    ws.send(JSON.stringify(payload))
    return true
  }

  private setStatus(next: ChatSessionStatus): void {
    if (this.status === next) return
    this.status = next
    for (const listener of this.statusListeners) listener(next)
  }

  private setLifecycleState(next: ChatSessionLifecycleState): void {
    if (this.lifecycleState === next) return
    this.lifecycleState = next
    for (const listener of this.lifecycleListeners) listener(next)
  }

  private clearPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private teardownSocket(): void {
    this.clearPing()
    this.clearReconnectTimer()
    this.ws?.close()
    this.ws = null
  }

  private attachPageHide(): void {
    if (this.pageHideListener || typeof window === 'undefined') return
    const onPageHide = () => {
      const w = this.ws
      if (w && w.readyState === WebSocket.OPEN) {
        try {
          w.send(JSON.stringify({ action: 'leave' }))
        } catch {
          /* ignore */
        }
      }
    }
    window.addEventListener('pagehide', onPageHide)
    this.pageHideListener = () => window.removeEventListener('pagehide', onPageHide)
  }

  private detachPageHide(): void {
    this.pageHideListener?.()
    this.pageHideListener = null
  }

  private dispatchInbound(data: Record<string, unknown>): void {
    const roomId = this.connectOptions?.roomId ?? ''
    const routed = routeInboundChatMessage(data, roomId)
    if (!routed) return
    switch (routed.type) {
      case 'chat_text':
        for (const listener of this.chatTextListeners) listener(routed.line)
        break
      case 'chat_gif':
        for (const listener of this.chatGifListeners) listener(routed.line)
        break
      case 'chat_reaction':
        for (const listener of this.chatReactionListeners) listener(routed.event)
        break
      case 'presence':
        for (const listener of this.presenceListeners) listener(routed.event)
        break
      case 'share_state':
        for (const listener of this.shareStateListeners) listener(routed.event)
        break
      case 'room_mode':
        for (const listener of this.roomModeListeners) listener(routed.event)
        break
      case 'av_disabled':
        for (const listener of this.avDisabledListeners) listener(routed.event)
        break
      default:
        break
    }
  }

  private openSocket(): void {
    const opts = this.connectOptions
    if (!opts || this.cancelled || !this.enabled) return

    this.teardownSocket()
    this.setStatus('connecting')
    this.setLifecycleState(
      this.failedReconnectCycles > 0
        ? chatLifecycleAfterFailedCycle(this.failedReconnectCycles)
        : 'reconnecting',
    )

    const qp = new URLSearchParams({ roomId: opts.roomId, sessionId: opts.sessionId })
    if (opts.displayName && opts.displayName.trim() !== '') {
      qp.set('displayName', opts.displayName.trim().slice(0, 48))
    }
    if (opts.accessToken) {
      qp.set('accessToken', opts.accessToken)
    }
    const wsUrlBase = `${opts.url}?${qp.toString()}`
    recordWsConnectAttempt(wsUrlBase, Boolean(opts.accessToken))
    if (webrtcDebugEnabled()) {
      webrtcLog('ws opening', {
        urlChars: wsUrlBase.length,
        hasAccessToken: Boolean(opts.accessToken),
        socketRole: opts.accessToken ? 'signed-in (JWT on query)' : 'guest/anonymous (expected)',
      })
    }

    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrlBase)
    } catch {
      this.recordReconnectFailure()
      this.setStatus('error')
      return
    }
    this.ws = ws

    ws.addEventListener('open', () => {
      if (this.cancelled || this.ws !== ws) return
      this.backoffMs = CHAT_RECONNECT_BACKOFF_INITIAL_MS
      this.failedReconnectCycles = 0
      this.lastErrorCode = undefined
      this.setStatus('open')
      this.setLifecycleState('connected')
      recordWsOpen()
      if (webrtcDebugEnabled()) webrtcLog('ws open')
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'presence_request' }))
      }
      const ping = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'ping' }))
        }
      }
      ping()
      this.pingTimer = setInterval(ping, PING_MS)
    })

    ws.addEventListener('message', (ev) => {
      if (this.ws !== ws) return
      recordInboundWsMessage(String(ev.data))
      try {
        const data = JSON.parse(String(ev.data)) as Record<string, unknown>
        this.dispatchInbound(data)
      } catch {
        /* ignore malformed */
      }
    })

    ws.addEventListener('close', (ev) => {
      if (this.ws !== ws) return
      this.clearPing()
      this.ws = null
      recordWsClose(ev.code, ev.reason !== '' ? ev.reason : undefined)
      if (!this.cancelled && webrtcDebugEnabled()) {
        webrtcLog('ws close', {
          code: ev.code,
          reason: typeof ev.reason === 'string' && ev.reason !== '' ? ev.reason : undefined,
        })
      }
      if (this.cancelled) return
      this.recordReconnectFailure()
      this.setStatus('closed')
      if (!this.enabled) {
        this.setLifecycleState('torn-down')
        return
      }
      this.setLifecycleState(chatLifecycleAfterFailedCycle(this.failedReconnectCycles))
      const { delayMs, nextBackoffMs } = nextChatReconnectBackoffMs(this.backoffMs)
      this.backoffMs = nextBackoffMs
      this.reconnectTimer = globalThis.setTimeout(() => {
        this.reconnectTimer = null
        this.openSocket()
      }, delayMs) as unknown as number
    })

    ws.addEventListener('error', () => {
      if (this.cancelled || this.ws !== ws) return
      recordWsErrorEvent()
      if (webrtcDebugEnabled()) webrtcLog('ws error event')
      this.setStatus('error')
      if (this.enabled) {
        this.setLifecycleState(chatLifecycleAfterFailedCycle(this.failedReconnectCycles))
      }
    })
  }

  private recordReconnectFailure(): void {
    if (this.cancelled || !this.enabled) return
    this.failedReconnectCycles += 1
  }
}
