import { PARTIAL_UNPUBLISH_DETACH_MS } from '../lib/harness-constants.js'
import { failHarness, resetHarnessFailures } from '../lib/harness-failure.js'
import {
  closeProducerKind,
  consumeRemoteProducers,
  consumerCountByKind,
  joinPeerPair,
  publishParticipantAv,
  sleep,
} from '../lib/sfu-peer.js'

resetHarnessFailures()

const { publisher, consumer } = await joinPeerPair('4-partial-unpublish')
await publishParticipantAv(publisher, '4-partial-unpublish')
await consumeRemoteProducers(consumer, '4-partial-unpublish')

if (consumerCountByKind(consumer, 'video') < 1 || consumerCountByKind(consumer, 'audio') < 1) {
  failHarness('produce_consume', 'PRECONDITION_FAILED', '4-partial-unpublish', 'expected video+audio consumers')
}

if (!publisher.signaling.open || !consumer.signaling.open) {
  failHarness('signaling', 'SESSION_NOT_OPEN', '4-partial-unpublish')
}

closeProducerKind(publisher, 'video')

const deadline = Date.now() + PARTIAL_UNPUBLISH_DETACH_MS
let videoDetached = false
while (Date.now() < deadline) {
  if (consumerCountByKind(consumer, 'video') === 0) {
    videoDetached = true
    break
  }
  await sleep(50)
}

if (!videoDetached) {
  failHarness(
    'produce_consume',
    'PARTIAL_UNPUBLISH_TIMEOUT',
    '4-partial-unpublish',
    `video consumers still ${consumerCountByKind(consumer, 'video')} after ${PARTIAL_UNPUBLISH_DETACH_MS}ms`,
  )
}

if (consumerCountByKind(consumer, 'audio') < 1) {
  failHarness('produce_consume', 'AUDIO_CONSUMER_LOST', '4-partial-unpublish')
}

if (!publisher.signaling.open || !consumer.signaling.open) {
  failHarness('signaling', 'SESSION_REBUILT', '4-partial-unpublish', 'signaling closed after partial unpublish')
}

publisher.close()
consumer.close()

console.log('step 4-partial-unpublish: ok')
