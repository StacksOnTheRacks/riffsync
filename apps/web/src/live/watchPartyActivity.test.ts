import { describe, expect, it, vi, afterEach } from 'vitest'
import { formatWatchPartyActivity, watchPartyHeadline, watchPartyRoomPath } from './watchPartyActivity'

describe('watchPartyActivity', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats recent and older activity', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-09T18:00:00.000Z'))

    expect(formatWatchPartyActivity(Date.now() - 10_000)).toBe('Active just now')
    expect(formatWatchPartyActivity(Date.now() - 60_000)).toBe('Active 1m ago')
    expect(formatWatchPartyActivity(Date.now() - 2 * 60 * 60 * 1000)).toBe('Active 2h ago')
    expect(formatWatchPartyActivity(undefined)).toBe('')
  })

  it('prefers a trimmed display title for the party headline', () => {
    expect(watchPartyHeadline({ displayTitle: ' Night of the Living Bread ', catalogEpisodeId: 'ep-1' })).toBe(
      'Night of the Living Bread',
    )
    expect(watchPartyHeadline({ catalogEpisodeId: 'ep-1' })).toBe('ep-1')
  })

  it('builds a room path from the room id', () => {
    expect(watchPartyRoomPath('room 1')).toBe('/room/room%201')
  })
})
