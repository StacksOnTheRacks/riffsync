import { useEffect, useMemo, useRef, useState } from 'react'
import { useCatalogListQuery } from '../../catalog/catalogQueries'
import { catalogEntriesPlayableInApp } from '../../catalog/catalogPlayback'
import { filterCatalogEntries } from '../../catalog/filterCatalogEntries'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import { getPublicOrigin } from '../../config/publicOrigin'
import { resolveHostSourceTabUrl } from '../../room/hostSourceTab'

const AUTO_HIDE_MS = 60_000
const LEAVE_HIDE_MS = 700
const EMPTY_CATALOG_ENTRIES: CatalogEpisode[] = []

type PartyCaptureMediaPickerProps = {
  currentEpisodeId: string | undefined
}

function formatOptionLabel(ep: CatalogEpisode): string {
  if (Number.isFinite(ep.experimentNumber) && ep.experimentNumber > 0) {
    return `${ep.experimentNumber}. ${ep.title}`
  }
  return ep.title
}

export function PartyCaptureMediaPicker({
  currentEpisodeId,
}: PartyCaptureMediaPickerProps) {
  const { data, isPending, isError, refetch } = useCatalogListQuery()
  const [titleQuery, setTitleQuery] = useState('')
  const [expanded, setExpanded] = useState(true)
  const autoHideTimerRef = useRef<number | undefined>(undefined)
  const leaveHideTimerRef = useRef<number | undefined>(undefined)

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

  useEffect(() => {
    autoHideTimerRef.current = window.setTimeout(() => {
      setExpanded(false)
    }, AUTO_HIDE_MS)

    return () => {
      if (autoHideTimerRef.current !== undefined) {
        window.clearTimeout(autoHideTimerRef.current)
      }
      if (leaveHideTimerRef.current !== undefined) {
        window.clearTimeout(leaveHideTimerRef.current)
      }
    }
  }, [])

  const showPicker = () => {
    if (leaveHideTimerRef.current !== undefined) {
      window.clearTimeout(leaveHideTimerRef.current)
    }
    setExpanded(true)
  }

  const scheduleHidePicker = () => {
    if (leaveHideTimerRef.current !== undefined) {
      window.clearTimeout(leaveHideTimerRef.current)
    }
    leaveHideTimerRef.current = window.setTimeout(() => {
      setExpanded(false)
    }, LEAVE_HIDE_MS)
  }

  const openSelectedEpisode = (selectedId: string) => {
    const selected = playableEntries.find((ep) => ep.id === selectedId)
    if (!selected || selected.id === currentEpisodeId) {
      return
    }
    window.location.assign(
      resolveHostSourceTabUrl({
        catalogEp: selected,
        catalogEpisodeId: selected.id,
        origin: getPublicOrigin(),
      }),
    )
  }

  const hasCatalog = playableEntries.length > 0
  const noMatches = hasCatalog && optionEntries.length === 0
  const selectDisabled = !hasCatalog || optionEntries.length === 0

  return (
    <div
      className={`riffsync-party-capture-picker${expanded ? ' riffsync-party-capture-picker--expanded' : ' riffsync-party-capture-picker--collapsed'}`}
      onMouseEnter={showPicker}
      onFocus={showPicker}
      onMouseLeave={scheduleHidePicker}
    >
      <div className="riffsync-party-capture-picker__hover-strip" aria-hidden />
      <div className="riffsync-party-capture-picker__panel">
        <div className="riffsync-party-capture-picker__inner">
          <div className="riffsync-party-capture-picker__copy">
            <span className="riffsync-party-capture-picker__eyebrow">Now playing</span>
            <strong>{currentEntry?.title ?? 'Current title'}</strong>
          </div>
          <label className="riffsync-party-capture-picker__field">
            <span>Filter titles</span>
            <input
              type="search"
              value={titleQuery}
              placeholder="Search catalog"
              disabled={isPending && !data}
              onChange={(e) => setTitleQuery(e.currentTarget.value)}
            />
          </label>
          <label className="riffsync-party-capture-picker__field riffsync-party-capture-picker__field--select">
            <span>Switch title</span>
            <select
              value={currentEpisodeId ?? ''}
              disabled={selectDisabled}
              onChange={(e) => openSelectedEpisode(e.currentTarget.value)}
            >
              {optionEntries.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {formatOptionLabel(ep)}
                </option>
              ))}
            </select>
          </label>
          <div className="riffsync-party-capture-picker__status" aria-live="polite">
            {isPending && !data ? 'Loading catalog...' : null}
            {isError && !data ? (
              <button type="button" onClick={() => void refetch()}>
                Retry catalog
              </button>
            ) : null}
            {noMatches ? 'No titles match that filter.' : null}
          </div>
        </div>
      </div>
    </div>
  )
}
