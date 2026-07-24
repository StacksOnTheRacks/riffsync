import { useCallback, useEffect, useState } from 'react'
import { cognitoSub } from '../auth/jwtDecode'
import {
  cancelFriendRequest,
  fetchFriendRosterSnapshot,
  mapFriendRequestError,
  sendFriendRequest,
  type FriendRosterSnapshot,
} from '../friends/friendsApi'
import type { RoomSidebarTab } from './roomPageTypes'

export function usePeopleRosterFriends(fanToken: string | null, activeSidebarTab: RoomSidebarTab) {
  const [snapshot, setSnapshot] = useState<FriendRosterSnapshot | null>(null)
  const [statusByFanSub, setStatusByFanSub] = useState<Record<string, string>>({})

  const myFanSub = fanToken ? cognitoSub(fanToken) : undefined

  const refreshSnapshot = useCallback(async (signal?: AbortSignal) => {
    if (!fanToken) {
      setSnapshot(null)
      return
    }
    const next = await fetchFriendRosterSnapshot(fanToken, signal)
    if (!signal?.aborted) {
      setSnapshot(next)
    }
  }, [fanToken])

  useEffect(() => {
    if (!fanToken || activeSidebarTab !== 'people') {
      return
    }
    const controller = new AbortController()
    let cancelled = false

    void fetchFriendRosterSnapshot(fanToken, controller.signal).then((next) => {
      if (!cancelled && !controller.signal.aborted) {
        setSnapshot(next)
      }
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeSidebarTab, fanToken])

  const setPeerStatus = useCallback((peerFanSub: string, message: string | null) => {
    setStatusByFanSub((current) => {
      if (!message) {
        if (!(peerFanSub in current)) return current
        const next = { ...current }
        delete next[peerFanSub]
        return next
      }
      return { ...current, [peerFanSub]: message }
    })
  }, [])

  const invitePeer = useCallback(
    async (peerFanSub: string) => {
      if (!fanToken) return
      setPeerStatus(peerFanSub, null)
      const result = await sendFriendRequest(fanToken, peerFanSub)
      if (result.ok) {
        setSnapshot((current) => {
          if (!current) {
            return {
              friends: [],
              inbound: [],
              outbound: [
                {
                  requestId: result.requestId,
                  requesterSub: myFanSub ?? '',
                  recipientSub: peerFanSub,
                  createdAt: result.createdAt,
                },
              ],
              anyUnread: false,
            }
          }
          const withoutDup = current.outbound.filter((entry) => entry.recipientSub !== peerFanSub)
          return {
            ...current,
            outbound: [
              ...withoutDup,
              {
                requestId: result.requestId,
                requesterSub: myFanSub ?? '',
                recipientSub: peerFanSub,
                createdAt: result.createdAt,
              },
            ],
          }
        })
        return
      }
      setPeerStatus(peerFanSub, mapFriendRequestError(result.code, result.error))
      if (result.code === 'already_friends') {
        void refreshSnapshot()
      }
    },
    [fanToken, myFanSub, refreshSnapshot, setPeerStatus],
  )

  const cancelPeerRequest = useCallback(
    async (peerFanSub: string, requestId: string) => {
      if (!fanToken) return
      setPeerStatus(peerFanSub, null)
      const result = await cancelFriendRequest(fanToken, requestId)
      if (result.ok) {
        setSnapshot((current) =>
          current
            ? {
                ...current,
                outbound: current.outbound.filter((entry) => entry.requestId !== requestId),
              }
            : current,
        )
        return
      }
      setPeerStatus(peerFanSub, mapFriendRequestError(result.code, result.error))
    },
    [fanToken, setPeerStatus],
  )

  return {
    snapshot,
    myFanSub,
    statusByFanSub,
    invitePeer,
    cancelPeerRequest,
    refreshSnapshot,
  }
}
