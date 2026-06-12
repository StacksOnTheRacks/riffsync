import {
  parseSfuTokenHttpErrorPayload,
  SfuTokenHttpError,
} from '../room/av/participantAvErrors'
import type { SfuTokenResponse } from '../room/sfu/mediasoupSharing'

function requireApiBase(apiBase: string | undefined): string {
  if (!apiBase) throw new Error('VITE_PUBLIC_API_BASE_URL is required for SFU token')
  return apiBase
}

export type SfuProducerClass = 'host_screen' | 'participant_av'

export async function fetchSfuJoinToken(options: {
  apiBaseUrl: string | undefined
  roomId: string
  sessionId: string
  accessToken: string | null
  /** Legacy single-class request. */
  producerClass?: SfuProducerClass
  /** Preferred: request allowed producer classes. */
  producerClasses?: SfuProducerClass[]
}): Promise<SfuTokenResponse> {
  const base = requireApiBase(options.apiBaseUrl)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'X-Session-Id': options.sessionId,
  }
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`
  }
  const body: {
    roomId: string
    producerClass?: SfuProducerClass
    producerClasses?: SfuProducerClass[]
  } = {
    roomId: options.roomId,
  }
  if (options.producerClasses && options.producerClasses.length > 0) {
    body.producerClasses = options.producerClasses
  } else if (options.producerClass) {
    body.producerClass = options.producerClass
  }
  const res = await fetch(`${base.replace(/\/$/, '')}/v1/webrtc/sfu-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new SfuTokenHttpError(res.status, parseSfuTokenHttpErrorPayload(text || res.statusText))
  }
  return (await res.json()) as SfuTokenResponse
}
