(() => {
  const CHANNEL = 'riffsync-host-bridge'
  const VERSION = 1
  const ALLOWED_ORIGINS = ['https://riffsync.tv', 'http://localhost:5173']
  const PAGE_WAIT_MS = 6000

  /** SW → page → SW (JWT / media control on party-capture tab). */
  const SW_TO_PAGE_REQUEST_TYPES = new Set([
    'HOST_JWT_REQUEST',
    'HOST_BRIDGE_PING',
    'HOST_MEDIA_PLAY',
    'HOST_MEDIA_PAUSE',
  ])
  const PAGE_TO_SW_RESPONSE_TYPES = new Set([
    'HOST_JWT_RESPONSE',
    'HOST_BRIDGE_PONG',
    'HOST_MEDIA_CONTROL_RESPONSE',
  ])

  /** Page → content script → SW (Room tab host console). */
  const PAGE_TO_EXT_REQUEST_TYPES = new Set([
    'HOST_EXTENSION_PING',
    'HOST_MEDIA_TAB_GET_STATE',
    'HOST_MEDIA_TAB_OPEN',
    'HOST_MEDIA_PLAYBACK',
  ])

  function isEnvelope(value) {
    return (
      Boolean(value) &&
      typeof value === 'object' &&
      value.channel === CHANNEL &&
      value.v === VERSION &&
      typeof value.requestId === 'string' &&
      value.requestId.length > 0 &&
      typeof value.type === 'string'
    )
  }

  function isAllowedOrigin(origin) {
    return ALLOWED_ORIGINS.includes(origin)
  }

  function shouldForwardPageResponse(event, requestId) {
    if (!event || event.source !== window) return false
    if (!isAllowedOrigin(event.origin)) return false
    if (!isEnvelope(event.data)) return false
    if (event.data.requestId !== requestId) return false
    return PAGE_TO_SW_RESPONSE_TYPES.has(event.data.type)
  }

  function responseTypeForSwRequest(requestType) {
    if (requestType === 'HOST_BRIDGE_PING') return 'HOST_BRIDGE_PONG'
    if (requestType === 'HOST_MEDIA_PLAY' || requestType === 'HOST_MEDIA_PAUSE') {
      return 'HOST_MEDIA_CONTROL_RESPONSE'
    }
    return 'HOST_JWT_RESPONSE'
  }

  function postToPage(message) {
    window.postMessage(message, window.location.origin)
  }

  function replyExtensionEnvelope(requestId, type, payload) {
    postToPage({
      channel: CHANNEL,
      v: VERSION,
      type,
      requestId,
      ...payload,
    })
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isEnvelope(message)) return undefined
    if (!SW_TO_PAGE_REQUEST_TYPES.has(message.type)) return undefined

    const pageOrigin = window.location.origin
    if (!isAllowedOrigin(pageOrigin)) {
      sendResponse({
        channel: CHANNEL,
        v: VERSION,
        type: responseTypeForSwRequest(message.type),
        requestId: message.requestId,
        ok: false,
        error: 'forbidden_origin',
      })
      return false
    }

    let settled = false
    const finish = (response) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onPage)
      clearTimeout(timer)
      sendResponse(response)
    }

    const onPage = (event) => {
      if (!shouldForwardPageResponse(event, message.requestId)) return
      finish(event.data)
    }

    window.addEventListener('message', onPage)
    window.postMessage(
      {
        channel: CHANNEL,
        v: VERSION,
        type: message.type,
        requestId: message.requestId,
      },
      pageOrigin,
    )
    const timer = setTimeout(() => {
      finish({
        channel: CHANNEL,
        v: VERSION,
        type: responseTypeForSwRequest(message.type),
        requestId: message.requestId,
        ok: false,
        error: 'unsupported',
      })
    }, PAGE_WAIT_MS)
    return true
  })

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    if (!isAllowedOrigin(event.origin)) return
    if (!isEnvelope(event.data)) return
    if (!PAGE_TO_EXT_REQUEST_TYPES.has(event.data.type)) return

    const { type, requestId } = event.data

    if (type === 'HOST_EXTENSION_PING') {
      replyExtensionEnvelope(requestId, 'HOST_EXTENSION_PONG', { ok: true })
      return
    }

    if (type === 'HOST_MEDIA_TAB_GET_STATE') {
      chrome.runtime.sendMessage({ type: 'getState' }, (response) => {
        const err = chrome.runtime.lastError
        if (err) {
          replyExtensionEnvelope(requestId, 'HOST_MEDIA_TAB_STATE', {
            ok: false,
            bound: false,
            roomId: null,
            origin: null,
            mediaTabOpen: false,
            mediaTabId: null,
            mediaTabUrl: null,
            mediaPlaybackControllable: false,
            reason: 'unsupported',
          })
          return
        }
        replyExtensionEnvelope(requestId, 'HOST_MEDIA_TAB_STATE', {
          ok: true,
          ...(response || {}),
        })
      })
      return
    }

    if (type === 'HOST_MEDIA_TAB_OPEN') {
      const url = typeof event.data.url === 'string' ? event.data.url : ''
      chrome.runtime.sendMessage({ type: 'openOrNavigate', url }, (response) => {
        const err = chrome.runtime.lastError
        if (err) {
          replyExtensionEnvelope(requestId, 'HOST_MEDIA_TAB_STATE', {
            ok: false,
            bound: false,
            roomId: null,
            origin: null,
            mediaTabOpen: false,
            mediaTabId: null,
            mediaTabUrl: null,
            mediaPlaybackControllable: false,
            reason: 'unsupported',
          })
          return
        }
        replyExtensionEnvelope(requestId, 'HOST_MEDIA_TAB_STATE', response || { ok: false })
      })
      return
    }

    if (type === 'HOST_MEDIA_PLAYBACK') {
      const action = event.data.action === 'pause' ? 'pause' : 'play'
      chrome.runtime.sendMessage({ type: 'mediaPlayback', action }, (response) => {
        const err = chrome.runtime.lastError
        if (err) {
          replyExtensionEnvelope(requestId, 'HOST_MEDIA_PLAYBACK_RESULT', {
            ok: false,
            bound: false,
            roomId: null,
            origin: null,
            mediaTabOpen: false,
            mediaTabId: null,
            mediaTabUrl: null,
            mediaPlaybackControllable: false,
            reason: 'unsupported',
          })
          return
        }
        replyExtensionEnvelope(requestId, 'HOST_MEDIA_PLAYBACK_RESULT', response || { ok: false })
      })
    }
  })
})()
