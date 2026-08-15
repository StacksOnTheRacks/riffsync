(() => {
  const CHANNEL = 'riffsync-host-bridge'
  const VERSION = 1
  const ALLOWED_ORIGINS = ['https://riffsync.tv', 'http://localhost:5173']
  const PAGE_WAIT_MS = 6000
  const REQUEST_TYPES = new Set([
    'HOST_JWT_REQUEST',
    'HOST_BRIDGE_PING',
    'HOST_MEDIA_PLAY',
    'HOST_MEDIA_PAUSE',
  ])
  const RESPONSE_TYPES = new Set([
    'HOST_JWT_RESPONSE',
    'HOST_BRIDGE_PONG',
    'HOST_MEDIA_CONTROL_RESPONSE',
  ])

  function isEnvelope(value) {
    return (
      Boolean(value) &&
      typeof value === 'object' &&
      value.channel === CHANNEL &&
      value.v === VERSION &&
      typeof value.requestId === 'string' &&
      value.requestId.length > 0 &&
      (REQUEST_TYPES.has(value.type) || RESPONSE_TYPES.has(value.type))
    )
  }

  function isAllowedOrigin(origin) {
    return ALLOWED_ORIGINS.includes(origin)
  }

  function shouldForward(event, requestId) {
    if (!event || event.source !== window) return false
    if (!isAllowedOrigin(event.origin)) return false
    if (!isEnvelope(event.data)) return false
    if (event.data.requestId !== requestId) return false
    return RESPONSE_TYPES.has(event.data.type)
  }

  function responseTypeFor(requestType) {
    if (requestType === 'HOST_BRIDGE_PING') return 'HOST_BRIDGE_PONG'
    if (requestType === 'HOST_MEDIA_PLAY' || requestType === 'HOST_MEDIA_PAUSE') {
      return 'HOST_MEDIA_CONTROL_RESPONSE'
    }
    return 'HOST_JWT_RESPONSE'
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isEnvelope(message)) return undefined
    if (!REQUEST_TYPES.has(message.type)) return undefined

    const pageOrigin = window.location.origin
    if (!isAllowedOrigin(pageOrigin)) {
      sendResponse({
        channel: CHANNEL,
        v: VERSION,
        type: responseTypeFor(message.type),
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
      if (!shouldForward(event, message.requestId)) return
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
        type: responseTypeFor(message.type),
        requestId: message.requestId,
        ok: false,
        error: 'unsupported',
      })
    }, PAGE_WAIT_MS)
    return true
  })
})()
