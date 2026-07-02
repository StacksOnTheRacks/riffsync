import { describe, expect, it } from 'vitest'
import {
  buildReceiverRenderedAcknowledgement,
  createCastSnapshotId,
  isPositiveReceiverRenderedAcknowledgement,
  parseCastReceiverOutboundMessage,
  resetCastSnapshotIdCounterForTests,
} from './castChannelProtocol'

describe('parseCastReceiverOutboundMessage', () => {
  it('accepts a valid receiver_rendered acknowledgement', () => {
    const ack = buildReceiverRenderedAcknowledgement('snap-1')
    expect(parseCastReceiverOutboundMessage(ack)).toEqual(ack)
  })

  it('returns unrecognized for unknown acknowledgement types', () => {
    expect(parseCastReceiverOutboundMessage({ type: 'render_confirmed' })).toBe('unrecognized')
  })

  it('returns null for non-object payloads', () => {
    expect(parseCastReceiverOutboundMessage(null)).toBeNull()
    expect(parseCastReceiverOutboundMessage('bad')).toBeNull()
  })
})

describe('isPositiveReceiverRenderedAcknowledgement', () => {
  it('requires schemaVersion, snapshotId, and both render flags', () => {
    const ack = buildReceiverRenderedAcknowledgement('snap-1')
    expect(isPositiveReceiverRenderedAcknowledgement(ack, 'snap-1')).toBe(true)
    expect(isPositiveReceiverRenderedAcknowledgement(ack, 'snap-2')).toBe(false)
    expect(isPositiveReceiverRenderedAcknowledgement({ ...ack, stagePrimaryRendered: false }, 'snap-1')).toBe(
      false,
    )
    expect(isPositiveReceiverRenderedAcknowledgement({ ...ack, chatOverlayRendered: false }, 'snap-1')).toBe(
      false,
    )
    expect(isPositiveReceiverRenderedAcknowledgement({ ...ack, schemaVersion: 2 }, 'snap-1')).toBe(false)
  })
})

describe('createCastSnapshotId', () => {
  it('returns unique ids for successive snapshots', () => {
    resetCastSnapshotIdCounterForTests()
    expect(createCastSnapshotId()).toBe('cast-snapshot-1')
    expect(createCastSnapshotId()).toBe('cast-snapshot-2')
  })
})
