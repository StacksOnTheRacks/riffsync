import { resetHarnessFailures } from '../lib/harness-failure.js'
import {
  consumeRemoteProducers,
  joinPeerPair,
  publishParticipantAv,
} from '../lib/sfu-peer.js'

resetHarnessFailures()

const { publisher, consumer } = await joinPeerPair('3-consume')
await publishParticipantAv(publisher, '3-consume')
await consumeRemoteProducers(consumer, '3-consume')

const hasFlowingTrack = consumer.consumers.some((c) => !c.closed && c.track.readyState === 'live')
if (!hasFlowingTrack) {
  throw new Error('no live remote consumer track')
}

publisher.close()
consumer.close()

console.log('step 3-consume: ok')
