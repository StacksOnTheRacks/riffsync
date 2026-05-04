import type { PlaybackExpectation } from '../catalog/catalogTypes'
import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

export type RoomPlaybackExpectation = 'free' | 'premium'

export function catalogToRoomPlayback(ep: { playbackExpectation?: PlaybackExpectation }): RoomPlaybackExpectation {
  return ep.playbackExpectation === 'premium' ? 'premium' : 'free'
}

export function roomPlaybackForBadge(p: RoomPlaybackExpectation | undefined): PlaybackExpectation {
  if (p === 'premium') return 'premium'
  return 'ad_supported'
}

export interface LobbyRoomRow {
  roomId: string
  catalogEpisodeId: string
  youtubeVideoId?: string
  playbackExpectation?: RoomPlaybackExpectation
  lastActivityAt?: number
  /** Host-editable headline for the lobby row. */
  displayTitle?: string
  /** WebSocket connections for this room (tabs / live sockets; not unique people). */
  liveConnectionCount?: number
}

export interface LobbyResponse {
  rooms: LobbyRoomRow[]
  staleRoomMsHint?: number
}

export async function fetchLobby(sessionId: string): Promise<LobbyResponse> {
  const base = getPublicApiBaseUrl()
  if (!base) {
    throw new Error('Configure VITE_PUBLIC_API_BASE_URL for lobby requests.')
  }
  const res = await fetch(`${base}/v1/lobby`, {
    headers: {
      Accept: 'application/json',
      'X-Session-Id': sessionId,
    },
  })
  if (!res.ok) {
    throw new Error(`Lobby failed (${res.status})`)
  }
  return (await res.json()) as LobbyResponse
}

export interface RoomSnapshot {
  roomId: string
  hostSub: string
  catalogEpisodeId: string
  youtubeVideoId: string
  /** Lobby / “now playing” label (host-editable). */
  displayTitle?: string
  playbackExpectation: RoomPlaybackExpectation
  visibility: 'public' | 'private'
  lastActivityAt: number
  version: number
}

export async function fetchRoom(roomId: string): Promise<RoomSnapshot | null> {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')
  const res = await fetch(`${base}/v1/rooms/${encodeURIComponent(roomId)}`, {
    headers: { Accept: 'application/json' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Room read failed (${res.status})`)
  const body = (await res.json()) as { room?: RoomSnapshot }
  return body.room ?? null
}

export async function createRoom(
  accessToken: string,
  body: {
    catalogEpisodeId: string
    playbackExpectation: RoomPlaybackExpectation
    visibility: 'public' | 'private'
  },
): Promise<RoomSnapshot & { roomId: string }> {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')
  const res = await fetch(`${base}/v1/rooms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new Error('Sign in again — host token rejected')
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Create room failed (${res.status}): ${t}`)
  }
  return (await res.json()) as RoomSnapshot & { roomId: string }
}

export interface RoomPatchResult {
  ok: true
  roomId: string
  version: number
  catalogEpisodeId: string
  youtubeVideoId: string
  visibility: 'public' | 'private'
  lastActivityAt: number
  displayTitle?: string
}

export async function patchRoom(
  accessToken: string,
  roomId: string,
  patch: {
    catalogEpisodeId?: string
    visibility?: 'public' | 'private'
    playbackExpectation?: RoomPlaybackExpectation
    displayTitle?: string
  },
): Promise<RoomPatchResult> {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')
  const res = await fetch(`${base}/v1/rooms/${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(patch),
  })
  if (res.status === 403) throw new Error('Only the room host can change the episode.')
  if (res.status === 401) throw new Error('Sign in again — host token rejected')
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Update room failed (${res.status}): ${t}`)
  }
  return (await res.json()) as RoomPatchResult
}
