import { useMemo, useState } from 'react'
import { useCatalogListQuery } from '../catalog/catalogQueries'
import { catalogEntriesPlayableInApp } from '../catalog/catalogPlayback'
import { filterCatalogEntries } from '../catalog/filterCatalogEntries'
import type { CatalogEpisode } from '../catalog/catalogTypes'
import { getPublicOrigin } from '../config/publicOrigin'
import { resolveHostSourceTabUrl } from './hostSourceTab'

const EMPTY_CATALOG_ENTRIES: CatalogEpisode[] = []

export type HostRoomMediaSwitcherProps = {
  currentEpisodeId: string
  onSelectEpisode: (episodeId: string) => Promise<void>
}

function formatOptionLabel(ep: CatalogEpisode): string {
  if (Number.isFinite(ep.experimentNumber) && ep.experimentNumber > 0) {
    return `${ep.experimentNumber}. ${ep.title}`
  }
  return ep.title
}

/** Host-only media switcher for the room playback panel (never mounted on the capture tab). */
export function HostRoomMediaSwitcher({
  currentEpisodeId,
  onSelectEpisode,
}: HostRoomMediaSwitcherProps) {
  const { data, isPending, isError, refetch } = useCatalogListQuery()
  const [titleQuery, setTitleQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const playableEntries = useMemo(
    () => catalogEntriesPlayableInApp(data ?? EMPTY_CATALOG_ENTRIES),
    [data],
  )
  const filteredEntries = useMemo(
    () => filterCatalogEntries(playableEntries, { titleQuery, catalogs: [] }),
    [playableEntries, titleQuery],
  )
  const currentEntry = useMemo(
    () => playableEntries.find((ep) => ep.id === currentEpisodeId),
    [currentEpisodeId, playableEntries],
  )
  const optionEntries = useMemo(() => {
    if (!currentEntry || filteredEntries.some((ep) => ep.id === currentEntry.id)) {
      return filteredEntries
    }
    return [currentEntry, ...filteredEntries]
  }, [currentEntry, filteredEntries])

  const selectEpisode = async (selectedId: string) => {
    if (!selectedId || selectedId === currentEpisodeId) return
    setBusy(true)
    setError(null)
    try {
      await onSelectEpisode(selectedId)
      const selected = playableEntries.find((ep) => ep.id === selectedId)
      if (selected) {
        const url = resolveHostSourceTabUrl({
          catalogEp: selected,
          catalogEpisodeId: selected.id,
          origin: getPublicOrigin(),
        })
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch title')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="riffsync-host-media-switcher" data-testid="host-room-media-switcher">
      <div className="riffsync-host-media-switcher__copy">
        <span className="riffsync-muted">Now playing</span>
        <strong>{currentEntry?.title ?? 'Current title'}</strong>
      </div>
      <label className="riffsync-host-media-switcher__field">
        <span>Filter titles</span>
        <input
          type="search"
          value={titleQuery}
          placeholder="Search catalog"
          disabled={(isPending && !data) || busy}
          onChange={(e) => setTitleQuery(e.currentTarget.value)}
        />
      </label>
      <label className="riffsync-host-media-switcher__field">
        <span>Switch title</span>
        <select
          value={currentEpisodeId}
          disabled={busy || optionEntries.length === 0}
          onChange={(e) => void selectEpisode(e.currentTarget.value)}
        >
          {optionEntries.map((ep) => (
            <option key={ep.id} value={ep.id}>
              {formatOptionLabel(ep)}
            </option>
          ))}
        </select>
      </label>
      <div className="riffsync-host-media-switcher__status" aria-live="polite">
        {isPending && !data ? 'Loading catalog...' : null}
        {isError && !data ? (
          <button type="button" onClick={() => void refetch()}>
            Retry catalog
          </button>
        ) : null}
        {error ? <span role="alert">{error}</span> : null}
      </div>
    </div>
  )
}
