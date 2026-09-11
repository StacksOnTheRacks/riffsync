import { startCastReceiverContext } from './castReceiverSession'

// CAF is loaded by a blocking script in cast/receiver/index.html. Start it
// before the React / mediasoup graph evaluates so Chromecast can accept the
// session inside its launch window.
try {
  startCastReceiverContext()
} catch {
  /* Desktop preview and tests may load this page without a Cast runtime. */
}

void import('./castReceiverApp')
