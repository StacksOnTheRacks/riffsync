import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { RoomSnapshot } from '../api/roomsApi'
import { fetchRoom } from '../api/roomsApi'
import { useCatalogEpisodeQuery } from '../catalog/catalogQueries'
import { cognitoSub } from '../auth/jwtDecode'
import { getFanAccessToken } from '../auth/fanTokens'
import { SITE_DOCUMENT_TITLE, trimTabTitleSegment } from '../config/documentTitle'
import { useRoomChrome } from './useRoomChrome'

export function useRoomSnapshot(roomId: string): {
  room: RoomSnapshot | null | undefined
  setRoom: Dispatch<SetStateAction<RoomSnapshot | null | undefined>>
  roomErr: string | null
  catalogEp: ReturnType<typeof useCatalogEpisodeQuery>['data']
  canonicalRoomId: string
  fanToken: string | null
  isPublisher: boolean
  avDisabled: boolean
  roomMode: RoomSnapshot['roomMode']
  youtubeVideoId: string | null | undefined
} {
  const fanToken = getFanAccessToken()
  const { setNowPlayingLabel } = useRoomChrome()
  const [room, setRoom] = useState<RoomSnapshot | null | undefined>(undefined)
  const [roomErr, setRoomErr] = useState<string | null>(null)

  const catalogEpisodeIdForQuery =
    room && room !== undefined && room !== null && room.roomId === roomId
      ? room.catalogEpisodeId
      : undefined
  const { data: catalogEp } = useCatalogEpisodeQuery(catalogEpisodeIdForQuery)

  const canonicalRoomId = useMemo(() => room?.roomId ?? roomId, [room?.roomId, roomId])
  const isPublisher = Boolean(room && fanToken && cognitoSub(fanToken) === room.hostSub)
  const avDisabled = room?.avDisabled ?? true
  const roomMode = room?.roomMode ?? 'theater'
  const youtubeVideoId = room?.youtubeVideoId ?? catalogEp?.youtubeVideoId ?? null

  const loadRoom = useCallback(async () => {
    if (!roomId) return
    try {
      const snap = await fetchRoom(roomId)
      setRoom(snap)
      setRoomErr(snap ? null : 'Room not found.')
    } catch (e) {
      setRoom(null)
      setRoomErr(e instanceof Error ? e.message : 'Could not load room')
    }
  }, [roomId, setRoom, setRoomErr])

  useEffect(() => {
    queueMicrotask(() => void loadRoom())
  }, [loadRoom])

  useEffect(() => {
    if (!roomId || !room) return
    const t = window.setInterval(() => {
      void loadRoom()
    }, 5000)
    return () => window.clearInterval(t)
  }, [roomId, room, loadRoom])

  useEffect(() => {
    const prev = document.title
    let next: string
    if (!roomId) {
      next = `Room · ${SITE_DOCUMENT_TITLE}`
    } else if (room === undefined && !roomErr) {
      next = `Watch party · Loading… · ${SITE_DOCUMENT_TITLE}`
    } else if (roomErr || room === null) {
      next = `Watch party · unavailable · ${SITE_DOCUMENT_TITLE}`
    } else if (!room) {
      next = `Watch party · Loading… · ${SITE_DOCUMENT_TITLE}`
    } else if (room.roomId !== roomId) {
      next = `Watch party · Loading… · ${SITE_DOCUMENT_TITLE}`
    } else {
      const r = room
      const primary =
        r.displayTitle ??
        (catalogEp?.id === r.catalogEpisodeId ? catalogEp.title : undefined) ??
        r.catalogEpisodeId ??
        'Episode'
      const label = trimTabTitleSegment(primary)
      next = `Watch party · ${label} · ${SITE_DOCUMENT_TITLE}`
    }
    document.title = next
    return () => {
      document.title = prev
    }
  }, [catalogEp, room, room?.roomId, roomErr, roomId])

  useEffect(() => {
    if (!roomId || room === undefined || room === null || room.roomId !== roomId) {
      setNowPlayingLabel(null)
      return
    }
    const label =
      room.displayTitle ??
      (catalogEp?.id === room.catalogEpisodeId ? catalogEp.title : undefined) ??
      room.catalogEpisodeId ??
      null
    setNowPlayingLabel(label)
    return () => setNowPlayingLabel(null)
  }, [catalogEp, room, roomId, setNowPlayingLabel])

  return {
    room,
    setRoom,
    roomErr,
    catalogEp,
    canonicalRoomId,
    fanToken,
    isPublisher,
    avDisabled,
    roomMode,
    youtubeVideoId,
  }
}
