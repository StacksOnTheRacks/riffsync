import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GiphySearchResult } from '../api/giphySearchApi'
import { getPublicWsUrl } from '../config/wsUrl'
import {
  applyChatReactionEvent,
  canAcceptReactionAdd,
  type ReactionsByMessage,
} from '../room/chatReactions'
import { mergeChatHistory } from '../room/chatHistoryMerge'
import { createChatMessageId } from '../room/chatMessageId'
import { buildChatSystemLine } from '../room/chatSystemLine'
import type { ChatLine } from '../room/roomPageTypes'
import { useChatSession } from '../room/useChatSession'
import type { ChatPresenceMember, TypingEvent } from '../room/sessions/ChatSession'

export function useLiveChannelChat(options: {
  roomId: string | undefined
  sessionId: string
  displayName: string
  fanToken: string | null
  enabled: boolean
}) {
  const { roomId, sessionId, displayName, fanToken, enabled } = options
  const wsBase = getPublicWsUrl()
  const { status, sendJson, session } = useChatSession({
    url: wsBase,
    roomId: roomId ?? '',
    sessionId,
    displayName,
    accessToken: fanToken,
    enabled: Boolean(enabled && roomId && wsBase),
  })

  const [chat, setChat] = useState<ChatLine[]>([])
  const [chatReactions, setChatReactions] = useState<ReactionsByMessage>({})
  const chatReactionsRef = useRef(chatReactions)
  chatReactionsRef.current = chatReactions
  const [chatDraft, setChatDraft] = useState('')
  const [presenceMembers, setPresenceMembers] = useState<ChatPresenceMember[]>([])
  const [remoteTyping, setRemoteTyping] = useState<TypingEvent[]>([])

  useEffect(() => {
    setChat([])
    setChatReactions({})
    setRemoteTyping([])
    setPresenceMembers([])
  }, [roomId])

  useEffect(() => {
    const unsubs = [
      session.onChatText((line) => setChat((prev) => [...prev, line])),
      session.onChatGif((line) => setChat((prev) => [...prev, line])),
      session.onChatSystem((event) => {
        setChat((prev) => [
          ...prev,
          buildChatSystemLine({
            sessionId: event.sessionId,
            displayName: event.displayName,
            systemEvent: event.event,
            ts: event.ts,
          }),
        ])
      }),
      session.onChatReaction((event) => {
        setChatReactions((prev) =>
          applyChatReactionEvent(
            prev,
            event.messageId,
            event.emoji,
            event.action,
            event.sessionId,
            sessionId,
          ),
        )
      }),
      session.onChatHistory((event) => {
        setChat((prevChat) => {
          const merged = mergeChatHistory(prevChat, chatReactionsRef.current, event)
          setChatReactions(merged.chatReactions)
          return merged.chat
        })
      }),
      session.onPresence((event) => {
        if (!roomId || event.roomId !== roomId) return
        setPresenceMembers(event.members)
      }),
      session.onTyping((event) => {
        if (!roomId || event.roomId !== roomId) return
        if (event.sessionId === sessionId) return
        setRemoteTyping((prev) => {
          const without = prev.filter((e) => e.sessionId !== event.sessionId)
          return event.action === 'start' ? [...without, event] : without
        })
      }),
    ]
    return () => {
      for (const u of unsubs) u()
    }
  }, [roomId, session, sessionId])

  const chatMemberLabels = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of presenceMembers) {
      m.set(p.sessionId, p.displayName)
    }
    m.set(sessionId, displayName)
    return m
  }, [displayName, presenceMembers, sessionId])

  const sendChat = useCallback(() => {
    if (!fanToken) return
    const txt = chatDraft.trim()
    if (!txt) return
    const sent = sendJson({ action: 'chat', text: txt, messageId: createChatMessageId() })
    if (sent) {
      setChatDraft('')
      session.onComposeSent()
    }
  }, [chatDraft, fanToken, sendJson, session])

  const sendChatGif = useCallback(
    (result: GiphySearchResult) => {
      if (!fanToken) return
      sendJson({
        action: 'chat_gif',
        messageId: createChatMessageId(),
        giphyId: result.giphyId,
        renditionUrl: result.renditionUrl,
        ...(result.title !== undefined && result.title.trim() !== ''
          ? { title: result.title.trim() }
          : {}),
        ...(result.width !== undefined ? { width: result.width } : {}),
        ...(result.height !== undefined ? { height: result.height } : {}),
      })
    },
    [fanToken, sendJson],
  )

  const toggleChatReaction = useCallback(
    (messageId: string, emoji: string, reactionAction: 'add' | 'remove') => {
      if (!fanToken) return
      const trimmedEmoji = emoji.trim()
      if (trimmedEmoji === '') return
      if (reactionAction === 'add') {
        const chips = chatReactions[messageId] ?? {}
        if (!canAcceptReactionAdd(chips, trimmedEmoji)) return
      }
      sendJson({
        action: 'react',
        messageId,
        emoji: trimmedEmoji,
        reactionAction,
      })
    },
    [chatReactions, fanToken, sendJson],
  )

  const onChatDraftChange = useCallback(
    (draft: string) => {
      setChatDraft(draft)
      session.onComposeDraftChange(draft)
    },
    [session],
  )

  return {
    wsStatus: status,
    chat,
    chatReactions,
    chatDraft,
    setChatDraft: onChatDraftChange,
    onComposeBlur: () => session.onComposeBlur(),
    sendChat,
    sendChatGif,
    toggleChatReaction,
    chatMemberLabels,
    remoteTyping,
    presenceCount: presenceMembers.length,
  }
}
