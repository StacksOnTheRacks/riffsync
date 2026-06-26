import type { RoomMode } from '../../api/roomsApi'
import { emitClientDrawerLog } from '../clientDrawerLog'
import { parseInboundChatGifMessage, type InboundChatGifLine } from '../chatGifMessage'
import { parseInboundChatMessageId } from '../chatMessageId'
import { parseHistoryReactions, type ChatHistorySnapshot } from '../chatHistoryMerge'
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
const TYPING_START_DEBOUNCE_MS = 300
const TYPING_COMPOSE_IDLE_MS = 3_000

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
  active?: boolean
  lastActiveAt?: number
  avatarUrl?: string
}

export type TypingEvent = {
  roomId: string
  sessionId: string
  displayName: string
  action: 'start' | 'stop'
  ts: number
}

export type ChatSystemEvent = {
  roomId: string
  sessionId: string
  displayName: string
  event: 'join' | 'leave'
  ts: number
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

export type ChatHistoryEvent = ChatHistorySnapshot & {
  roomId: string
}

export type ChatInboundRouted =
  | { type: 'chat_text'; line: ChatTextLine }
  | { type: 'chat_gif'; line: ChatGifLine }
  | { type: 'chat_reaction'; event: ChatReactionEvent }
  | { type: 'chat_history'; event: ChatHistoryEvent }
  | { type: 'presence'; event: PresenceEvent }
  | { type: 'typing'; event: TypingEvent }
  | { type: 'chat_system'; event: ChatSystemEvent }
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

function parseInboundLastActiveAt(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined
  return Math.floor(raw)
}

function parseHistoryTextLine(raw: Record<string, unknown>): ChatTextLine | null {
  if (raw.kind !== 'text') return null
  const messageId = parseInboundChatMessageId(raw.messageId)
  if (messageId === null) return null
  if (typeof raw.sessionId !== 'string' || typeof raw.text !== 'string') return null
  const ts = typeof raw.ts === 'number' ? raw.ts : Date.now()
  const displayName = typeof raw.displayName === 'string' ? raw.displayName : undefined
  const avatarUrl = parseInboundAvatarUrl(raw.avatarUrl)
  return {
    kind: 'text',
    messageId,
    sessionId: raw.sessionId,
    text: String(raw.text),
    ts,
    ...(displayName !== undefined && displayName !== '' ? { displayName } : {}),
    ...(avatarUrl !== undefined ? { avatarUrl } : {}),
  }
}

function parseHistoryGifLine(raw: Record<string, unknown>): ChatGifLine | null {
  if (raw.kind !== 'gif') return null
  const gifLine = parseInboundChatGifMessage(raw)
  if (gifLine === null) return null
  return { kind: 'gif', ...gifLine }
}

function parseHistoryMessages(raw: unknown): Array<ChatTextLine | ChatGifLine> {
  if (!Array.isArray(raw)) return []
  const lines: Array<ChatTextLine | ChatGifLine> = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const textLine = parseHistoryTextLine(entry)
    if (textLine) {
      lines.push(textLine)
      continue
    }
    const gifLine = parseHistoryGifLine(entry)
    if (gifLine) lines.push(gifLine)
  }
  return lines
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
  if (t === 'chat_reaction' &&
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
  if (t === 'chat_history' && typeof data.roomId === 'string') {
    if (data.roomId !== canonicalRoomId) return null
    return {
      type: 'chat_history',
      event: {
        roomId: data.roomId,
        messages: parseHistoryMessages(data.messages),
        reactions: parseHistoryReactions(data.reactions),
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
      const lastActiveAt = parseInboundLastActiveAt(m.lastActiveAt)
      members.push({
        sessionId: sid,
        displayName: dn,
        isHost: Boolean(m.isHost),
        ...(m.active === true ? { active: true } : m.active === false ? { active: false } : {}),
        ...(lastActiveAt !== undefined ? { lastActiveAt } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      })
    }
    return { type: 'presence', event: { roomId: data.roomId, members } }
  }
  if (t === 'typing' && typeof data.roomId === 'string') {
    if (data.roomId !== canonicalRoomId) return null
    const sessionId = data.sessionId
    const displayName = data.displayName
    const action = data.action
    if (typeof sessionId !== 'string' || typeof displayName !== 'string') return null
    if (action !== 'start' && action !== 'stop') return null
    const ts = typeof data.ts === 'number' ? data.ts : Date.now()
    return {
      type: 'typing',
      event: {
        roomId: data.roomId,
        sessionId,
        displayName,
        action,
        ts,
      },
    }
  }
  if (t === 'chat_system' && typeof data.roomId === 'string') {
    if (data.roomId !== canonicalRoomId) return null
    const sessionId = data.sessionId
    const displayName = data.displayName
    const systemEvent = data.event
    if (typeof sessionId !== 'string' || typeof displayName !== 'string') return null
    if (systemEvent !== 'join' && systemEvent !== 'leave') return null
    const ts = typeof data.ts === 'number' ? data.ts : Date.now()
    return {
      type: 'chat_system',
      event: {
        roomId: data.roomId,
        sessionId,
        displayName,
        event: systemEvent,
        ts,
      },
    }
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
  private composeTypingStarted = false
  private typingStartDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private typingIdleTimer: ReturnType<typeof setTimeout> | null = null

  private chatTextListeners = new Set<Listener<ChatTextLine>>()
  private chatGifListeners = new Set<Listener<ChatGifLine>>()
  private chatReactionListeners = new Set<Listener<ChatReactionEvent>>()
  private chatHistoryListeners = new Set<Listener<ChatHistoryEvent>>()
  private presenceListeners = new Set<Listener<PresenceEvent>>()
  private typingListeners = new Set<Listener<TypingEvent>>()
  private chatSystemListeners = new Set<Listener<ChatSystemEvent>>()
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

  onChatHistory(listener: Listener<ChatHistoryEvent>): () => void {
    this.chatHistoryListeners.add(listener)
    return () => this.chatHistoryListeners.delete(listener)
  }

  onPresence(listener: Listener<PresenceEvent>): () => void {
    this.presenceListeners.add(listener)
    return () => this.presenceListeners.delete(listener)
  }

  onTyping(listener: Listener<TypingEvent>): () => void {
    this.typingListeners.add(listener)
    return () => this.typingListeners.delete(listener)
  }

  onChatSystem(listener: Listener<ChatSystemEvent>): () => void {
    this.chatSystemListeners.add(listener)
    return () => this.chatSystemListeners.delete(listener)
  }

  /** Signed-in fans only: debounced typing_start / typing_stop on compose changes. */
  onComposeDraftChange(draft: string): void {
    this.clearTypingIdleTimer()
    if (!this.connectOptions?.accessToken) return

    const trimmed = draft.trim()
    if (trimmed === '') {
      this.clearTypingStartDebounce()
      this.emitTypingStopIfNeeded()
      return
    }

    this.scheduleTypingIdleStop()
    if (this.composeTypingStarted || this.typingStartDebounceTimer) return

    this.typingStartDebounceTimer = setTimeout(() => {
      this.typingStartDebounceTimer = null
      if (!this.connectOptions?.accessToken || this.composeTypingStarted) return
      const sent = this.send({ action: 'typing_start' })
      if (sent) {
        this.composeTypingStarted = true
        emitClientDrawerLog({
          drawer: 'chat',
          event: 'typing_start_sent',
          outcome: 'retry',
        })
      }
    }, TYPING_START_DEBOUNCE_MS)
  }

  onComposeBlur(): void {
    this.clearTypingTimers()
    this.emitTypingStopIfNeeded()
  }

  onComposeSent(): void {
    this.clearTypingTimers()
    this.emitTypingStopIfNeeded()
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

  /**
   * Apply a presence display-name change without reconnecting. Persists the new name onto
   * the stored connect options so any later reconnect carries it as a query param, and pushes
   * a `rename` control frame on the live socket so the server updates presence immediately.
   * Skipped silently when the socket is not open (the next reconnect query param carries it),
   * so a rename never raises a send-dropped error.
   */
  updateDisplayName(displayName: string): void {
    if (this.connectOptions) {
      this.connectOptions = { ...this.connectOptions, displayName }
    }
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'rename', displayName }))
    }
  }

  /** Persist refreshed fan JWT so automatic reconnects keep publisher/host presence. */
  updateAccessToken(accessToken: string | null): void {
    if (this.connectOptions) {
      this.connectOptions = { ...this.connectOptions, accessToken }
    }
  }

  disconnect(): void {
    this.cancelled = true
    this.enabled = false
    this.detachPageHide()
    this.clearTypingTimers()
    this.emitTypingStopIfNeeded()
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
    const prev = this.lifecycleState
    this.lifecycleState = next
    if (next === 'degraded' && prev !== 'degraded') {
      emitClientDrawerLog({
        drawer: 'chat',
        event: 'degraded_threshold',
        outcome: 'failed',
        severity: 'warn',
      })
    }
    for (const listener of this.lifecycleListeners) listener(next)
  }

  private clearTypingStartDebounce(): void {
    if (this.typingStartDebounceTimer) {
      clearTimeout(this.typingStartDebounceTimer)
      this.typingStartDebounceTimer = null
    }
  }

  private clearTypingIdleTimer(): void {
    if (this.typingIdleTimer) {
      clearTimeout(this.typingIdleTimer)
      this.typingIdleTimer = null
    }
  }

  private clearTypingTimers(): void {
    this.clearTypingStartDebounce()
    this.clearTypingIdleTimer()
  }

  private scheduleTypingIdleStop(): void {
    this.clearTypingIdleTimer()
    this.typingIdleTimer = setTimeout(() => {
      this.typingIdleTimer = null
      this.emitTypingStopIfNeeded()
    }, TYPING_COMPOSE_IDLE_MS)
  }

  private emitTypingStopIfNeeded(): void {
    if (!this.composeTypingStarted) return
    this.composeTypingStarted = false
    if (!this.connectOptions?.accessToken) return
    const sent = this.send({ action: 'typing_stop' })
    if (sent) {
      emitClientDrawerLog({
        drawer: 'chat',
        event: 'typing_stop_sent',
        outcome: 'retry',
      })
    }
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
      case 'chat_history':
        for (const listener of this.chatHistoryListeners) listener(routed.event)
        break
      case 'presence':
        for (const listener of this.presenceListeners) listener(routed.event)
        break
      case 'typing':
        emitClientDrawerLog({
          drawer: 'chat',
          event: 'typing_fanout',
          outcome: 'retry',
        })
        for (const listener of this.typingListeners) listener(routed.event)
        break
      case 'chat_system':
        emitClientDrawerLog({
          drawer: 'chat',
          event: 'chat_system_fanout',
          outcome: 'retry',
        })
        for (const listener of this.chatSystemListeners) listener(routed.event)
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
    emitClientDrawerLog({
      drawer: 'chat',
      event: 'ws_connect_attempt',
      outcome: 'retry',
    })
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
      const recoveredFromReconnect = this.failedReconnectCycles > 0
      this.backoffMs = CHAT_RECONNECT_BACKOFF_INITIAL_MS
      this.failedReconnectCycles = 0
      this.lastErrorCode = undefined
      this.setStatus('open')
      this.setLifecycleState('connected')
      recordWsOpen()
      emitClientDrawerLog({
        drawer: 'chat',
        event: 'ws_open',
        outcome: 'recovered',
      })
      if (recoveredFromReconnect) {
        emitClientDrawerLog({
          drawer: 'chat',
          event: 'reconnect_success',
          outcome: 'recovered',
        })
      }
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
      emitClientDrawerLog({
        drawer: 'chat',
        event: 'ws_close',
        outcome: 'retry',
        severity: 'warn',
      })
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
      emitClientDrawerLog({
        drawer: 'chat',
        event: 'reconnect_scheduled',
        outcome: 'retry',
      })
      this.reconnectTimer = globalThis.setTimeout(() => {
        this.reconnectTimer = null
        this.openSocket()
      }, delayMs) as unknown as number
    })

    ws.addEventListener('error', () => {
      if (this.cancelled || this.ws !== ws) return
      recordWsErrorEvent()
      emitClientDrawerLog({
        drawer: 'chat',
        event: 'ws_error',
        outcome: 'failed',
        severity: 'warn',
      })
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
