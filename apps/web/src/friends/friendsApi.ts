import { getPublicApiBaseUrl } from '../config/apiBaseUrl'
import { FAN_AUTH_REQUIRED_CLIENT, requireFanAccessToken } from './requireFanAccessToken'

export type FriendRequestEntry = {
  requestId: string
  requesterSub: string
  recipientSub: string
  createdAt: number
}

export type FriendEntry = {
  fanSub: string
  pairKey: string
  displayName: string
  avatarUrl?: string
  online: boolean
  hasUnread: boolean
  createdAt: number
}

export type FriendRosterSnapshot = {
  friends: FriendEntry[]
  inbound: FriendRequestEntry[]
  outbound: FriendRequestEntry[]
  anyUnread: boolean
}

export type FriendApiFailure = {
  ok: false
  status: number
  code?: string
  error?: string
}

export type SendFriendRequestResult =
  | { ok: true; requestId: string; createdAt: number }
  | FriendApiFailure

export type CancelFriendRequestResult = { ok: true } | FriendApiFailure

async function parseFailure(res: Response): Promise<FriendApiFailure> {
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

export function mapFriendRequestError(code?: string, fallback?: string): string {
  switch (code) {
    case 'already_friends':
      return 'You are already friends.'
    case 'friend_request_inbound_exists':
      return 'They already sent you a request. Accept it from your friends list.'
    case 'rate_limited':
      return 'Too many requests. Try again in a minute.'
    case 'cannot_friend_self':
      return 'You cannot send a friend request to yourself.'
    default:
      return fallback ?? 'Could not send friend request. Try again.'
  }
}

export async function fetchFriendRosterSnapshot(
  _accessToken: string,
  signal?: AbortSignal,
): Promise<FriendRosterSnapshot | null> {
  const accessToken = requireFanAccessToken()
  if (!accessToken) {
    return null
  }

  const base = getPublicApiBaseUrl()
  if (!base) return null

  try {
    const headers = { Authorization: `Bearer ${accessToken}` }
    const [friendsRes, requestsRes] = await Promise.all([
      fetch(`${base}/v1/friends`, { headers, signal }),
      fetch(`${base}/v1/friends/requests`, { headers, signal }),
    ])

    if (!friendsRes.ok || !requestsRes.ok) {
      return null
    }

    const friendsJson = (await friendsRes.json()) as { friends?: unknown }
    const requestsJson = (await requestsRes.json()) as { inbound?: unknown; outbound?: unknown }

    const friends = Array.isArray(friendsJson.friends)
      ? friendsJson.friends.filter(
          (entry): entry is FriendEntry =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as FriendEntry).fanSub === 'string' &&
            typeof (entry as FriendEntry).pairKey === 'string',
        )
      : []

    const parseRequests = (raw: unknown): FriendRequestEntry[] =>
      Array.isArray(raw)
        ? raw.filter(
            (entry): entry is FriendRequestEntry =>
              typeof entry === 'object' &&
              entry !== null &&
              typeof (entry as FriendRequestEntry).requestId === 'string' &&
              typeof (entry as FriendRequestEntry).requesterSub === 'string' &&
              typeof (entry as FriendRequestEntry).recipientSub === 'string',
          )
        : []

    const anyUnread =
      typeof (friendsJson as { anyUnread?: unknown }).anyUnread === 'boolean'
        ? (friendsJson as { anyUnread: boolean }).anyUnread
        : friends.some((entry) => entry.hasUnread)

    return {
      friends,
      inbound: parseRequests(requestsJson.inbound),
      outbound: parseRequests(requestsJson.outbound),
      anyUnread,
    }
  } catch {
    return null
  }
}

export type AcceptFriendRequestResult =
  | { ok: true; pairKey: string; createdAt: number }
  | FriendApiFailure

export async function acceptFriendRequest(
  _accessToken: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<AcceptFriendRequestResult> {
  const accessToken = requireFanAccessToken()
  if (!accessToken) {
    return FAN_AUTH_REQUIRED_CLIENT
  }

  const base = getPublicApiBaseUrl()
  if (!base) {
    return { ok: false, status: 0, error: 'API base URL not configured' }
  }

  const res = await fetch(`${base}/v1/friends/requests/${encodeURIComponent(requestId)}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  })

  if (!res.ok) {
    return parseFailure(res)
  }

  const json = (await res.json()) as { pairKey?: unknown; createdAt?: unknown }
  const pairKey = typeof json.pairKey === 'string' ? json.pairKey : ''
  const createdAt = typeof json.createdAt === 'number' ? json.createdAt : Date.now()
  if (!pairKey) {
    return { ok: false, status: res.status, error: 'Unexpected response from server' }
  }
  return { ok: true, pairKey, createdAt }
}

export async function declineFriendRequest(
  _accessToken: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | FriendApiFailure> {
  const accessToken = requireFanAccessToken()
  if (!accessToken) {
    return FAN_AUTH_REQUIRED_CLIENT
  }

  const base = getPublicApiBaseUrl()
  if (!base) {
    return { ok: false, status: 0, error: 'API base URL not configured' }
  }

  const res = await fetch(`${base}/v1/friends/requests/${encodeURIComponent(requestId)}/decline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  })

  if (!res.ok) {
    return parseFailure(res)
  }
  return { ok: true }
}

export type RemoveFriendResult = { ok: true; removedAt: number } | FriendApiFailure

export async function removeFriend(
  _accessToken: string,
  pairKey: string,
  signal?: AbortSignal,
): Promise<RemoveFriendResult> {
  const accessToken = requireFanAccessToken()
  if (!accessToken) {
    return FAN_AUTH_REQUIRED_CLIENT
  }

  const base = getPublicApiBaseUrl()
  if (!base) {
    return { ok: false, status: 0, error: 'API base URL not configured' }
  }

  const res = await fetch(`${base}/v1/friends/${encodeURIComponent(pairKey)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  })

  if (!res.ok) {
    return parseFailure(res)
  }

  const json = (await res.json()) as { removedAt?: unknown }
  const removedAt = typeof json.removedAt === 'number' ? json.removedAt : Date.now()
  return { ok: true, removedAt }
}

export async function sendFriendRequest(
  _accessToken: string,
  recipientSub: string,
  signal?: AbortSignal,
): Promise<SendFriendRequestResult> {
  const accessToken = requireFanAccessToken()
  if (!accessToken) {
    return FAN_AUTH_REQUIRED_CLIENT
  }

  const base = getPublicApiBaseUrl()
  if (!base) {
    return { ok: false, status: 0, error: 'API base URL not configured' }
  }

  const res = await fetch(`${base}/v1/friends/requests`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ recipientSub }),
    signal,
  })

  if (!res.ok) {
    return parseFailure(res)
  }

  const json = (await res.json()) as {
    requestId?: unknown
    createdAt?: unknown
  }
  const requestId = typeof json.requestId === 'string' ? json.requestId : ''
  const createdAt = typeof json.createdAt === 'number' ? json.createdAt : Date.now()
  if (!requestId) {
    return { ok: false, status: res.status, error: 'Unexpected response from server' }
  }
  return { ok: true, requestId, createdAt }
}

export async function cancelFriendRequest(
  _accessToken: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<CancelFriendRequestResult> {
  const accessToken = requireFanAccessToken()
  if (!accessToken) {
    return FAN_AUTH_REQUIRED_CLIENT
  }

  const base = getPublicApiBaseUrl()
  if (!base) {
    return { ok: false, status: 0, error: 'API base URL not configured' }
  }

  const res = await fetch(`${base}/v1/friends/requests/${encodeURIComponent(requestId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  })

  if (!res.ok) {
    return parseFailure(res)
  }
  return { ok: true }
}
