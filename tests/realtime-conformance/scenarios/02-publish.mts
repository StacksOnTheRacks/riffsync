import { resetHarnessFailures } from '../lib/harness-failure.js'
import { joinPeerPair, publishParticipantAv } from '../lib/sfu-peer.js'

resetHarnessFailures()

const { publisher, consumer } = await joinPeerPair('2-publish')
await publishParticipantAv(publisher, '2-publish')

publisher.close()
consumer.close()

console.log('step 2-publish: ok')
