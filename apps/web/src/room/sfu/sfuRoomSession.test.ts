import { describe, expect, it } from 'vitest'
import {
  formatSfuTokenError,
  isRosterConsistency403,
  resolveSfuTokenProducerClass,
} from './sfuRoomSession'
import { createParticipantAvController } from './participantAvSession'

describe('formatSfuTokenError', () => {
  it('expands roster-related 403 copy', () => {
    const msg = formatSfuTokenError(
      new Error('sfu-token 403: Open the room WebSocket first (unknown session for this room).'),
    )
    expect(msg).toContain('Video relay denied access.')
    expect(msg).toContain('Open the room WebSocket first')
  })
})

describe('isRosterConsistency403', () => {
  it('detects transient roster race errors', () => {
    expect(
      isRosterConsistency403(
        new Error('sfu-token 403: Open the room WebSocket first (unknown session for this room).'),
      ),
    ).toBe(true)
    expect(isRosterConsistency403(new Error('sfu-token 401: expired'))).toBe(false)
  })
})

describe('resolveSfuTokenProducerClass', () => {
  it('returns undefined when no publish intent exists', () => {
    const participantAv = createParticipantAvController({ canPublish: () => true })
    expect(
      resolveSfuTokenProducerClass({
        participantAv,
        getHostScreenStream: () => null,
      }),
    ).toBeUndefined()
  })

  it('requests host_screen when tab capture is live', () => {
    const participantAv = createParticipantAvController({ canPublish: () => true })
    const hostStream = {
      getTracks: () => [{ kind: 'video', readyState: 'live' }],
    } as MediaStream

    expect(
      resolveSfuTokenProducerClass({
        participantAv,
        getHostScreenStream: () => hostStream,
      }),
    ).toBe('host_screen')
  })
})
