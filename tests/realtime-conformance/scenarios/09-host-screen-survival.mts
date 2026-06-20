import { PARTIAL_UNPUBLISH_DETACH_MS } from '../lib/harness-constants.js'
import { failHarness, resetHarnessFailures } from '../lib/harness-failure.js'
import {
  closeProducerKindForClass,
  consumeRemoteProducers,
  consumerCountByProducerClass,
  joinConsumerPeer,
  joinDualClassPublisher,
  publishProducerClass,
  sleep,
} from '../lib/sfu-peer.js'

resetHarnessFailures()

const publisher = await joinDualClassPublisher('9-host-screen-survival')
const consumer = await joinConsumerPeer('9-host-screen-survival', 'sess-host-screen-consumer')

await publishProducerClass(publisher, 'host_screen', '9-host-screen-survival', ['video'])
await publishProducerClass(publisher, 'participant_av', '9-host-screen-survival', ['video', 'audio'])
await consumeRemoteProducers(consumer, '9-host-screen-survival')

if (
  consumerCountByProducerClass(consumer, 'host_screen', 'video') < 1 ||
  consumerCountByProducerClass(consumer, 'participant_av', 'video') < 1
) {
  failHarness(
    'produce_consume',
    'PRECONDITION_FAILED',
    '9-host-screen-survival',
    'expected host_screen and participant_av video consumers',
  )
}

if (!publisher.signaling.open || !consumer.signaling.open) {
  failHarness('signaling', 'SESSION_NOT_OPEN', '9-host-screen-survival')
}

closeProducerKindForClass(publisher, 'participant_av', 'video')

const deadline = Date.now() + PARTIAL_UNPUBLISH_DETACH_MS
let participantVideoDetached = false
while (Date.now() < deadline) {
  if (consumerCountByProducerClass(consumer, 'participant_av', 'video') === 0) {
    participantVideoDetached = true
    break
  }
  await sleep(50)
}

if (!participantVideoDetached) {
  failHarness(
    'produce_consume',
    'PARTICIPANT_VIDEO_DETACH_TIMEOUT',
    '9-host-screen-survival',
    `participant_av video consumers still ${consumerCountByProducerClass(consumer, 'participant_av', 'video')}`,
  )
}

if (consumerCountByProducerClass(consumer, 'host_screen', 'video') < 1) {
  failHarness(
    'produce_consume',
    'HOST_SCREEN_CONSUMER_LOST',
    '9-host-screen-survival',
    'host_screen video consumer detached when participant_av video closed',
  )
}

if (!publisher.signaling.open || !consumer.signaling.open) {
  failHarness(
    'signaling',
    'SESSION_REBUILT',
    '9-host-screen-survival',
    'signaling closed after participant_av video unpublish',
  )
}

publisher.close()
consumer.close()

console.log('step 9-host-screen-survival: ok')
