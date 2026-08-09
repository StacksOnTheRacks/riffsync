import { getPublicApiBaseUrl } from '../config/apiBaseUrl'
import type { CastChatOverlayLine, CastPresentationSnapshot } from '../room/cast/castChannelProtocol'

export type TvPairingCreateResponse = {
  pairingId: string
  code: string
  pollToken: string
  expiresInSeconds: number
}

export type TvPairingLivePlayback = {
  roomId: string
  sessionId: string
  apiBaseUrl?: string
}

export type TvPairingPollResponse = {
  status: 'waiting' | 'linked' | 'expired' | 'released'
  tvClientSessionId?: string
  livePlayback?: TvPairingLivePlayback
  snapshot?: CastPresentationSnapshot
  chatOverlay?: { messages: CastChatOverlayLine[] }
}

export type TvPairingClaimResponse = {
  pairingId: string
  tvClientSessionId: string
  claimToken: string
}

function apiBase(): string {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL for TV pairing.')
  return base
}

export async function createTvPairing(): Promise<TvPairingCreateResponse> {
  const res = await fetch(`${apiBase()}/v1/tv/pairing`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) throw new Error(`TV pairing create failed (${res.status})`)
  return (await res.json()) as TvPairingCreateResponse
}

export async function pollTvPairing(
  pairingId: string,
  pollToken: string,
): Promise<TvPairingPollResponse> {
  const url = new URL(`${apiBase()}/v1/tv/pairing/${encodeURIComponent(pairingId)}`)
  url.searchParams.set('pollToken', pollToken)
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (res.status === 404) return { status: 'expired' }
  if (!res.ok) throw new Error(`TV pairing poll failed (${res.status})`)
  return (await res.json()) as TvPairingPollResponse
}

export async function claimTvPairing(input: {
  code: string
  roomId: string
  sessionId: string
  apiBaseUrl?: string
  tvClientSessionId: string
}): Promise<TvPairingClaimResponse> {
  const res = await fetch(`${apiBase()}/v1/tv/pairing/claim`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: input.code.trim().toUpperCase(),
      roomId: input.roomId,
      sessionId: input.sessionId,
      apiBaseUrl: input.apiBaseUrl,
      tvClientSessionId: input.tvClientSessionId,
    }),
  })
  if (res.status === 404 || res.status === 409 || res.status === 410) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Invalid or expired TV code')
  }
  if (!res.ok) throw new Error(`TV pairing claim failed (${res.status})`)
  return (await res.json()) as TvPairingClaimResponse
}

export async function pushTvPairingPresentation(input: {
  pairingId: string
  claimToken: string
  snapshot: CastPresentationSnapshot
  chatMessages?: CastChatOverlayLine[]
}): Promise<void> {
  const res = await fetch(
    `${apiBase()}/v1/tv/pairing/${encodeURIComponent(input.pairingId)}/presentation`,
    {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claimToken: input.claimToken,
        snapshot: input.snapshot,
        chatOverlay: input.chatMessages ? { messages: input.chatMessages } : undefined,
      }),
    },
  )
  if (!res.ok) throw new Error(`TV pairing presentation update failed (${res.status})`)
}

export async function releaseTvPairing(input: {
  pairingId: string
  claimToken: string
}): Promise<void> {
  const res = await fetch(
    `${apiBase()}/v1/tv/pairing/${encodeURIComponent(input.pairingId)}/release`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimToken: input.claimToken }),
    },
  )
  if (!res.ok) throw new Error(`TV pairing release failed (${res.status})`)
}
