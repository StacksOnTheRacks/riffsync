import { useCallback, useEffect, useRef, useState } from 'react'
import { cognitoSub } from '../auth/jwtDecode'
import type { DmDrawerError } from './dmDrawerCodes'
import { ensureDmThread, fetchDmMessages, markDmRead, type DmMessage } from './dmApi'
import { getSharedFanDmSession, syncSharedFanDmSessionWithAuth, type InboundDmMessage } from './FanDmSession'
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  fetchFriendRosterSnapshot,
  removeFriend,
  type FriendEntry,
  type FriendRosterSnapshot,
} from './friendsApi'
import { requireFanAccessToken } from './requireFanAccessToken'

export type OpenDmPeer = {
  fanSub: string
  pairKey: string
  displayName: string
  avatarUrl?: string
}

export type RoomFriendsPaneState = {
  loading: boolean
  loadError: boolean
  snapshot: FriendRosterSnapshot | null
  openPeer: OpenDmPeer | null
  dmMessages: DmMessage[]
  dmClosed: boolean
  dmLoading: boolean
  dmDraft: string
  dmComposeError: string | null
  removeTarget: FriendEntry | null
  anyUnread: boolean
  setDmDraft: (draft: string) => void
  refreshRoster: () => void
  acceptRequest: (requestId: string) => void
  declineRequest: (requestId: string) => void
  cancelRequest: (requestId: string) => void
  openDm: (friend: FriendEntry) => void
  closeDm: () => void
  confirmRemove: (friend: FriendEntry) => void
  cancelRemove: () => void
  executeRemove: () => void
  sendDm: () => void
}

function sortDmMessages(messages: DmMessage[]): DmMessage[] {
  return [...messages].sort((a, b) => a.sentAt - b.sentAt || a.messageId.localeCompare(b.messageId))
}

function mergeInboundMessage(existing: DmMessage[], inbound: InboundDmMessage): DmMessage[] {
  if (existing.some((m) => m.messageId === inbound.messageId)) {
    return existing
  }
  return sortDmMessages([
    ...existing,
    {
      messageId: inbound.messageId,
      senderSub: inbound.senderSub,
      kind: 'text',
      body: inbound.body,
      sentAt: inbound.sentAt,
    },
  ])
}

async function markPeerMessagesRead(
  fanToken: string,
  pairKey: string,
  messages: DmMessage[],
  myFanSub: string | undefined,
  onUnreadCleared: () => void,
): Promise<void> {
  if (messages.length === 0) return
  const latest = messages[messages.length - 1]
  if (latest.senderSub === myFanSub) return
  const result = await markDmRead(fanToken, pairKey, latest.sentAt, latest.messageId)
  if (result.ok && !result.hasUnread) {
    onUnreadCleared()
  }
}

export function useRoomFriendsPane(friendsTabActive: boolean, enabled: boolean): RoomFriendsPaneState {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [snapshot, setSnapshot] = useState<FriendRosterSnapshot | null>(null)
  const [openPeer, setOpenPeer] = useState<OpenDmPeer | null>(null)
  const [dmMessages, setDmMessages] = useState<DmMessage[]>([])
  const [dmClosed, setDmClosed] = useState(false)
  const [dmLoading, setDmLoading] = useState(false)
  const [dmDraft, setDmDraft] = useState('')
  const [dmComposeError, setDmComposeError] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<FriendEntry | null>(null)
  const bootstrappedRef = useRef(false)
  const openPeerRef = useRef<OpenDmPeer | null>(null)

  useEffect(() => {
    openPeerRef.current = openPeer
  }, [openPeer])

  const fanToken = requireFanAccessToken()
  const myFanSub = fanToken ? cognitoSub(fanToken) : undefined

  const refreshRoster = useCallback(async () => {
    if (!fanToken) {
      setSnapshot(null)
      return
    }
    setLoading(true)
    setLoadError(false)
    const next = await fetchFriendRosterSnapshot(fanToken)
    setLoading(false)
    if (!next) {
      setLoadError(true)
      return
    }
    setSnapshot(next)
  }, [fanToken])

  const loadDmThread = useCallback(
    async (friend: FriendEntry) => {
      if (!fanToken) return
      setDmLoading(true)
      setDmClosed(false)
      setDmComposeError(null)
      const ensured = await ensureDmThread(fanToken, friend.fanSub)
      if (!ensured.ok) {
        setDmLoading(false)
        if (
          ensured.code === 'friendship_not_active' ||
          ensured.code === 'dm_thread_closed' ||
          ensured.status === 403
        ) {
          setDmClosed(true)
          setDmMessages([])
        }
        return
      }
      const history = await fetchDmMessages(fanToken, ensured.pairKey)
      setDmLoading(false)
      if (!history.ok) {
        if (
          history.code === 'friendship_not_active' ||
          history.code === 'dm_thread_closed' ||
          history.status === 403
        ) {
          setDmClosed(true)
          setDmMessages([])
        }
        return
      }
      const sorted = sortDmMessages(history.page.messages)
      const peer: OpenDmPeer = {
        fanSub: friend.fanSub,
        pairKey: ensured.pairKey,
        displayName: friend.displayName,
        avatarUrl: friend.avatarUrl,
      }
      setOpenPeer(peer)
      setDmMessages(sorted)
      void markPeerMessagesRead(fanToken, peer.pairKey, sorted, myFanSub, () => {
        void refreshRoster()
      })
    },
    [fanToken, myFanSub, refreshRoster],
  )

  useEffect(() => {
    if (!enabled || !fanToken) return
    if (!bootstrappedRef.current && friendsTabActive) {
      bootstrappedRef.current = true
      syncSharedFanDmSessionWithAuth()
    }
    const timer = window.setTimeout(() => {
      if (friendsTabActive) {
        void refreshRoster()
      } else {
        void fetchFriendRosterSnapshot(fanToken).then((next) => {
          if (next) {
            setSnapshot((current) => current ?? next)
          }
        })
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [enabled, friendsTabActive, fanToken, refreshRoster])

  useEffect(() => {
    if (!enabled || !fanToken) return
    const session = getSharedFanDmSession()
    return session.registerHandlers({
      onInboundMessage: (message) => {
        const peer = openPeerRef.current
        if (peer && message.pairKey === peer.pairKey) {
          setDmMessages((current) => {
            const next = mergeInboundMessage(current, message)
            void markPeerMessagesRead(fanToken, peer.pairKey, next, myFanSub, () => {
              void refreshRoster()
            })
            return next
          })
        }
        void refreshRoster()
      },
      onDrawerError: (error: DmDrawerError) => {
        if (error.code === 'DM_SEND_DROPPED') {
          setDmComposeError('Message could not be sent. Try again.')
        } else if (error.code === 'DM_PUSH_UNAVAILABLE') {
          setDmComposeError('Live delivery unavailable. Messages still send when you retry.')
        }
      },
    })
  }, [enabled, fanToken, myFanSub, refreshRoster])

  const acceptRequest = useCallback(
    async (requestId: string) => {
      if (!fanToken) return
      const result = await acceptFriendRequest(fanToken, requestId)
      if (result.ok) {
        void refreshRoster()
      }
    },
    [fanToken, refreshRoster],
  )

  const declineRequest = useCallback(
    async (requestId: string) => {
      if (!fanToken) return
      const result = await declineFriendRequest(fanToken, requestId)
      if (result.ok) {
        setSnapshot((current) =>
          current
            ? { ...current, inbound: current.inbound.filter((entry) => entry.requestId !== requestId) }
            : current,
        )
      }
    },
    [fanToken],
  )

  const cancelRequest = useCallback(
    async (requestId: string) => {
      if (!fanToken) return
      const result = await cancelFriendRequest(fanToken, requestId)
      if (result.ok) {
        setSnapshot((current) =>
          current
            ? { ...current, outbound: current.outbound.filter((entry) => entry.requestId !== requestId) }
            : current,
        )
      }
    },
    [fanToken],
  )

  const openDm = useCallback(
    (friend: FriendEntry) => {
      void loadDmThread(friend)
    },
    [loadDmThread],
  )

  const closeDm = useCallback(() => {
    setOpenPeer(null)
    setDmMessages([])
    setDmClosed(false)
    setDmDraft('')
    setDmComposeError(null)
  }, [])

  const confirmRemove = useCallback((friend: FriendEntry) => {
    setRemoveTarget(friend)
  }, [])

  const cancelRemove = useCallback(() => {
    setRemoveTarget(null)
  }, [])

  const executeRemove = useCallback(async () => {
    if (!fanToken || !removeTarget) return
    const target = removeTarget
    setRemoveTarget(null)
    const result = await removeFriend(fanToken, target.pairKey)
    if (result.ok) {
      if (openPeerRef.current?.pairKey === target.pairKey) {
        setDmClosed(true)
        setDmComposeError(null)
      }
      void refreshRoster()
    }
  }, [fanToken, removeTarget, refreshRoster])

  const sendDm = useCallback(async () => {
    if (!fanToken || !openPeer || dmClosed) return
    const body = dmDraft.trim()
    if (!body) return
    setDmComposeError(null)
    const messageId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dm-${Date.now()}`
    const session = getSharedFanDmSession()
    const sent = await session.sendMessage(openPeer.pairKey, {
      messageId,
      kind: 'text',
      body,
    })
    if (sent) {
      setDmMessages((current) =>
        mergeInboundMessage(current, {
          type: 'dm_message',
          schemaVersion: 1,
          pairKey: openPeer.pairKey,
          messageId: sent.messageId,
          senderSub: sent.senderSub,
          kind: 'text',
          body: sent.body,
          sentAt: sent.sentAt,
        }),
      )
      setDmDraft('')
      void refreshRoster()
    }
  }, [fanToken, openPeer, dmClosed, dmDraft, refreshRoster])

  return {
    loading,
    loadError,
    snapshot,
    openPeer,
    dmMessages,
    dmClosed,
    dmLoading,
    dmDraft,
    dmComposeError,
    removeTarget,
    anyUnread: snapshot?.anyUnread ?? false,
    setDmDraft,
    refreshRoster,
    acceptRequest,
    declineRequest,
    cancelRequest,
    openDm,
    closeDm,
    confirmRemove,
    cancelRemove,
    executeRemove,
    sendDm,
  }
}
