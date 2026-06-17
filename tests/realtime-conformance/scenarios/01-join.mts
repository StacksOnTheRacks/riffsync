import { resetHarnessFailures } from '../lib/harness-failure.js'
import { joinPeerPair } from '../lib/sfu-peer.js'

resetHarnessFailures()

const { publisher, consumer } = await joinPeerPair('1-join')

if (!publisher.signaling.open) {
  throw new Error('publisher signaling not open')
}
if (!consumer.signaling.open) {
  throw new Error('consumer signaling not open')
}

publisher.close()
consumer.close()

console.log('step 1-join: ok')
