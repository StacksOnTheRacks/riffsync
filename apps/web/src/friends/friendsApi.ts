import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

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
  accessToken: string,
  signal?: AbortSignal,
): Promise<FriendRosterSnapshot | null> {
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

    return {
      friends,
      inbound: parseRequests(requestsJson.inbound),
      outbound: parseRequests(requestsJson.outbound),
    }
  } catch {
    return null
  }
}

export async function sendFriendRequest(
  accessToken: string,
  recipientSub: string,
  signal?: AbortSignal,
): Promise<SendFriendRequestResult> {
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
  accessToken: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<CancelFriendRequestResult> {
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
