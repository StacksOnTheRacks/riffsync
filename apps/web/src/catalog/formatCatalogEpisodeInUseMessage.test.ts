import { describe, expect, it } from 'vitest'
import { formatCatalogEpisodeInUseMessage } from './formatCatalogEpisodeInUseMessage'

describe('formatCatalogEpisodeInUseMessage', () => {
  it('includes room and list counts when present', () => {
    expect(formatCatalogEpisodeInUseMessage({ rooms: 3, lists: 1 })).toBe(
      'Cannot delete — this episode is used by 3 active watch party room(s) and/or 1 list(s).',
    )
  })

  it('omits zero reference counts', () => {
    expect(formatCatalogEpisodeInUseMessage({ rooms: 2, lists: 0 })).toBe(
      'Cannot delete — this episode is used by 2 active watch party room(s).',
    )
  })
})
