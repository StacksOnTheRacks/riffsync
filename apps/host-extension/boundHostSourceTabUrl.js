import { selectCatalogRow } from './catalogApi.js'
import { resolveHostSourceTabUrl } from './hostSourceTabUrl.js'

/**
 * Resolve the host-source media URL for the bound room's current title.
 * Uses the library row when present (YouTube non-embed path); otherwise falls
 * back to the party-capture /watch URL via resolveHostSourceTabUrl.
 *
 * @returns {{ ok: true, url: string } | { ok: false, reason: string }}
 */
export function resolveBoundHostSourceTabUrl({ room, origin, libraryEntries = [] }) {
  if (typeof origin !== 'string' || origin.trim().length === 0) {
    return { ok: false, reason: 'missing_origin' }
  }

  if (!room || typeof room !== 'object') {
    return { ok: false, reason: 'missing_room' }
  }

  const catalogEpisodeId =
    typeof room.catalogEpisodeId === 'string' ? room.catalogEpisodeId.trim() : ''
  if (!catalogEpisodeId) {
    return { ok: false, reason: 'missing_catalog_episode' }
  }

  const { row } = selectCatalogRow(libraryEntries, catalogEpisodeId)
  const url = resolveHostSourceTabUrl({
    catalogEp: row,
    catalogEpisodeId,
    origin,
  })
  return { ok: true, url }
}

export function boundHostSourceTabErrorMessage(result) {
  if (!result || result.ok) return ''
  if (result.reason === 'missing_origin' || result.reason === 'unbound') {
    return 'Open refused: active tab is not a room on an allowed origin.'
  }
  if (result.reason === 'missing_room' || result.reason === 'room_fetch_failed') {
    return 'Could not load the room title. Retry now playing, then try again.'
  }
  if (result.reason === 'missing_catalog_episode') {
    return 'This room has no catalog title to open.'
  }
  return 'Could not open the media tab.'
}
