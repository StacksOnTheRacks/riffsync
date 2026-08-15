import { createHostBridgeRequest, isHostBridgeEnvelope } from './hostBridge.js'
import { isPartyCapturePlaybackUrl } from './mediaPlayback.js'

export const MEDIA_CONTROL_TIMEOUT_MS = 5000

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

function normalizeControlResponse(response) {
  if (!isHostBridgeEnvelope(response) || response.type !== 'HOST_MEDIA_CONTROL_RESPONSE') {
    return { ok: false, reason: 'unsupported' }
  }
  if (response.ok === true) return { ok: true }
  if (typeof response.error === 'string' && response.error.length > 0) {
    return { ok: false, reason: response.error }
  }
  return { ok: false, reason: 'unsupported' }
}

export async function requestMediaPlaybackControl({
  mediaTabId,
  mediaTabUrl,
  action,
  sendMessage,
  timeoutMs = MEDIA_CONTROL_TIMEOUT_MS,
  createRequestId = () => crypto.randomUUID(),
}) {
  if (mediaTabId == null) {
    return { ok: false, reason: 'media_tab_closed' }
  }
  if (!isPartyCapturePlaybackUrl(mediaTabUrl)) {
    return { ok: false, reason: 'not_controllable' }
  }
  if (action !== 'play' && action !== 'pause') {
    return { ok: false, reason: 'unsupported' }
  }

  const type = action === 'play' ? 'HOST_MEDIA_PLAY' : 'HOST_MEDIA_PAUSE'
  const requestId = createRequestId()
  const request = createHostBridgeRequest(type, requestId)

  let settled = false
  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ ok: false, reason: 'timeout' })
    }, timeoutMs)

    Promise.resolve()
      .then(() => sendMessage(mediaTabId, request))
      .then((response) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(normalizeControlResponse(response))
      })
      .catch((error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ ok: false, reason: classifySendError(error) })
      })
  })
}
