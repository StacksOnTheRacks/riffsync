(() => {
  const CHANNEL = 'riffsync-host-bridge'
  const VERSION = 1
  const ALLOWED_ORIGINS = ['https://riffsync.tv', 'http://localhost:5173']
  const PAGE_WAIT_MS = 6000

  function isEnvelope(value) {
    return (
      Boolean(value) &&
      typeof value === 'object' &&
      value.channel === CHANNEL &&
      value.v === VERSION &&
      typeof value.requestId === 'string' &&
      value.requestId.length > 0 &&
      (value.type === 'HOST_JWT_REQUEST' ||
        value.type === 'HOST_JWT_RESPONSE' ||
        value.type === 'HOST_BRIDGE_PING' ||
        value.type === 'HOST_BRIDGE_PONG')
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
    return event.data.type === 'HOST_JWT_RESPONSE' || event.data.type === 'HOST_BRIDGE_PONG'
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isEnvelope(message)) return undefined
    if (message.type !== 'HOST_JWT_REQUEST' && message.type !== 'HOST_BRIDGE_PING') {
      return undefined
    }

    const pageOrigin = window.location.origin
    if (!isAllowedOrigin(pageOrigin)) {
      sendResponse({
        channel: CHANNEL,
        v: VERSION,
        type: message.type === 'HOST_BRIDGE_PING' ? 'HOST_BRIDGE_PONG' : 'HOST_JWT_RESPONSE',
        requestId: message.requestId,
        ok: false,
        error: 'forbidden_origin',
      })
      return false
    }

    const onPage = (event) => {
      if (!shouldForward(event, message.requestId)) return
      window.removeEventListener('message', onPage)
      sendResponse(event.data)
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
    setTimeout(() => {
      window.removeEventListener('message', onPage)
    }, PAGE_WAIT_MS)
    return true
  })
})()
