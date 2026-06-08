import type { SfuTokenResponse } from '../room/sfu/mediasoupSharing'

function requireApiBase(apiBase: string | undefined): string {
  if (!apiBase) throw new Error('VITE_PUBLIC_API_BASE_URL is required for SFU token')
  return apiBase
}

export async function fetchSfuJoinToken(options: {
  apiBaseUrl: string | undefined
  roomId: string
  sessionId: string
  accessToken: string | null
  producerClass?: 'host_screen' | 'participant_av'
}): Promise<SfuTokenResponse> {
  const base = requireApiBase(options.apiBaseUrl)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'X-Session-Id': options.sessionId,
  }
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`
  }
  const body: { roomId: string; producerClass?: 'host_screen' | 'participant_av' } = {
    roomId: options.roomId,
  }
  if (options.producerClass) {
    body.producerClass = options.producerClass
  }
  const res = await fetch(`${base.replace(/\/$/, '')}/v1/webrtc/sfu-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let detail = text || res.statusText
    try {
      const j = JSON.parse(text) as { error?: unknown; detail?: unknown }
      if (typeof j.error === 'string') {
        detail =
          typeof j.detail === 'string' && j.detail.trim() !== ''
            ? `${j.error} (${j.detail})`
            : j.error
      }
    } catch {
      /* keep raw body */
    }
    throw new Error(`sfu-token ${res.status}: ${detail}`)
  }
  return (await res.json()) as SfuTokenResponse
}
