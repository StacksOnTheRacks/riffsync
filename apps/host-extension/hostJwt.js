import { createHostBridgeRequest, isHostBridgeEnvelope } from './hostBridge.js'

/** Must stay above content-script page wait so a late SPA reply is not raced by the SW. */
export const JWT_REQUEST_TIMEOUT_MS = 8000

export function createEphemeralJwtCache() {
  let accessToken = null

  return {
    peek() {
      return accessToken
    },
    store(token) {
      accessToken = typeof token === 'string' && token.length > 0 ? token : null
    },
    drop() {
      accessToken = null
    },
  }
}

function classifySendError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  ) {
    return 'content_script_missing'
  }
  return 'unsupported'
}

function normalizeJwtResponse(response) {
  if (!isHostBridgeEnvelope(response) || response.type !== 'HOST_JWT_RESPONSE') {
    return { ok: false, error: 'unsupported' }
  }
  if (response.ok === true && typeof response.accessToken === 'string' && response.accessToken.length > 0) {
    return { ok: true, accessToken: response.accessToken }
  }
  if (response.ok === false && typeof response.error === 'string' && response.error.length > 0) {
    return { ok: false, error: response.error }
  }
  return { ok: false, error: 'unsupported' }
}

export async function requestHostAccessToken({
  tabId,
  sendMessage,
  timeoutMs = JWT_REQUEST_TIMEOUT_MS,
  createRequestId = () => crypto.randomUUID(),
}) {
  if (tabId == null) {
    return { ok: false, error: 'content_script_missing' }
  }

  const requestId = createRequestId()
  const request = createHostBridgeRequest('HOST_JWT_REQUEST', requestId)

  let settled = false
  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ ok: false, error: 'timeout' })
    }, timeoutMs)

    Promise.resolve()
      .then(() => sendMessage(tabId, request))
      .then((response) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(normalizeJwtResponse(response))
      })
      .catch((error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ ok: false, error: classifySendError(error) })
      })
  })
}
