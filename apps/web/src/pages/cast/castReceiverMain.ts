import { startCastReceiverContext } from './castReceiverSession'

// Classic /cast-receiver-boot.js already called context.start() on hardware.
// This adopts that session (or starts CAF in desktop / test fallbacks) before
// the React graph evaluates.
try {
  startCastReceiverContext()
} catch {
  /* Desktop preview and tests may load this page without a Cast runtime. */
}

void import('./castReceiverApp')
