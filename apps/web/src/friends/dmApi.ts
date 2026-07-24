import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

export type DmSendRequest = {
  messageId: string
  kind: 'text'
  body: string
}

export type DmSendResponse = {
  pairKey: string
  messageId: string
  senderSub: string
  kind: 'text'
  body: string
  sentAt: number
}

export type DmSendFailure = {
  ok: false
  status: number
  code?: string
  error?: string
}

export type DmSendResult = { ok: true; message: DmSendResponse } | DmSendFailure

export async function postDmMessage(
  accessToken: string,
  pairKey: string,
  payload: DmSendRequest,
  signal?: AbortSignal,
): Promise<DmSendResult> {
  const base = getPublicApiBaseUrl()
  if (!base) {
    return { ok: false, status: 0, error: 'API base URL not configured' }
  }

  const path = `/v1/dm/threads/${encodeURIComponent(pairKey)}/messages`
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  })

  if (!res.ok) {
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

  const message = (await res.json()) as DmSendResponse
  return { ok: true, message }
}
