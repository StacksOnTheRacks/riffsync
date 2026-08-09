import { useMemo, useState } from 'react'
import { useCatalogListQuery } from '../catalog/catalogQueries'
import { catalogEntriesPlayableInApp } from '../catalog/catalogPlayback'
import type { CatalogEpisode } from '../catalog/catalogTypes'

const EMPTY_CATALOG_ENTRIES: CatalogEpisode[] = []

export type HostRoomMediaSwitcherProps = {
  currentEpisodeId: string
  onSelectEpisode: (episodeId: string) => Promise<void>
  /** After a successful room PATCH, open/navigate the shared host source tab. */
  onOpenSourceTab: (episode: CatalogEpisode) => void
}

function formatOptionLabel(ep: CatalogEpisode): string {
  if (Number.isFinite(ep.experimentNumber) && ep.experimentNumber > 0) {
    return `${ep.experimentNumber}. ${ep.title}`
  }
  return ep.title
}

/** Compact host-only title select for the room playback panel (never on the capture tab). */
export function HostRoomMediaSwitcher({
  currentEpisodeId,
  onSelectEpisode,
  onOpenSourceTab,
}: HostRoomMediaSwitcherProps) {
  const { data, isPending, isError, refetch } = useCatalogListQuery()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const playableEntries = useMemo(
    () => catalogEntriesPlayableInApp(data ?? EMPTY_CATALOG_ENTRIES),
    [data],
  )
  const currentEntry = useMemo(
    () => playableEntries.find((ep) => ep.id === currentEpisodeId),
    [currentEpisodeId, playableEntries],
  )
  const optionEntries = useMemo(() => {
    if (!currentEntry || playableEntries.some((ep) => ep.id === currentEntry.id)) {
      return playableEntries
    }
    return [currentEntry, ...playableEntries]
  }, [currentEntry, playableEntries])

  const selectEpisode = async (selectedId: string) => {
    if (!selectedId || selectedId === currentEpisodeId) return
    setBusy(true)
    setError(null)
    try {
      await onSelectEpisode(selectedId)
      const selected = playableEntries.find((ep) => ep.id === selectedId)
      if (selected) onOpenSourceTab(selected)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch title')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="riffsync-host-media-switcher" data-testid="host-room-media-switcher">
      <label className="riffsync-host-media-switcher__field">
        <span>Title</span>
        <select
          value={currentEpisodeId}
          disabled={busy || optionEntries.length === 0}
          aria-label="Switch title"
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
