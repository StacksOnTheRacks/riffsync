/**
 * First script on /cast/receiver. Must stay ES5. Posts html_loaded before CAF
 * evaluates so a session_error still tells us whether Chromecast ran our JS.
 * Vite replaces __RIFFSYNC_PUBLIC_API_BASE_URL__ at build / dev serve time.
 */
(function () {
  var API = '__RIFFSYNC_PUBLIC_API_BASE_URL__'
  var ALLOWED = {
    receiver_html_loaded: true,
    receiver_caf_missing: true,
    receiver_caf_started: true,
    receiver_caf_failed: true,
    receiver_app_mounted: true,
    receiver_rendered: true,
  }

  function post(event) {
    if (!ALLOWED[event]) return
    if (!API || API.indexOf('__RIFFSYNC') === 0) return
    var url = API.replace(/\/$/, '') + '/v1/cast/diag'
    var body = JSON.stringify({ event: event, hop: 'receiver' })
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        if (navigator.sendBeacon(url, body)) return
      }
    } catch (ignored) {}
    try {
      if (typeof fetch === 'function') {
        fetch(url, {
          method: 'POST',
          body: body,
          keepalive: true,
          mode: 'cors',
          headers: { 'content-type': 'text/plain' },
        })
      }
    } catch (ignored2) {}
  }

  window.__riffsyncCastDiag = post
  post('receiver_html_loaded')
})()
