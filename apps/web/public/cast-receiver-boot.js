/**
 * Classic (non-module) CAF start for Chromecast firmware that never
 * evaluates type="module". Must stay ES5 and must run immediately after
 * cast_receiver_framework.js. CSP allows this file via script-src 'self'.
 */
(function () {
  var NAMESPACE = 'urn:x-cast:com.riffsync.presentation'
  var boot = {
    started: false,
    context: null,
    queue: [],
    onMessage: null,
  }
  window.__riffsyncCastReceiver = boot

  var fw = window.cast && window.cast.framework
  if (!fw || !fw.CastReceiverContext || !fw.CastReceiverOptions) {
    return
  }

  var context = fw.CastReceiverContext.getInstance()
  boot.context = context

  context.addCustomMessageListener(NAMESPACE, function (event) {
    if (typeof boot.onMessage === 'function') {
      boot.onMessage(event)
      return
    }
    boot.queue.push(event)
  })

  var options = new fw.CastReceiverOptions()
  options.customNamespaces = {}
  options.customNamespaces[NAMESPACE] = fw.system.MessageType.JSON
  options.disableIdleTimeout = true
  options.skipPlayersLoad = true
  context.start(options)
  boot.started = true
})()
