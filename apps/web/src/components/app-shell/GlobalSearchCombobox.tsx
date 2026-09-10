import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CATALOG_UNAVAILABLE_MESSAGE } from '../../catalog/catalogLoadError'
import { useCatalogListQuery } from '../../catalog/catalogQueries'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import { filterGlobalSearchCatalogTitles } from './filterGlobalSearchResults'
import { GlobalSearchResultRow } from './GlobalSearchResultRow'

function SearchStatusAnnouncement({ message }: { message: string }) {
  return (
    <div className="sr-only" aria-live="polite">
      {message}
    </div>
  )
}

export function GlobalSearchCombobox() {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { data, isPending, isError } = useCatalogListQuery()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const hasCache = (data?.length ?? 0) > 0 || data !== undefined
  const showLoading = isPending && !hasCache
  const showError = isError && !hasCache

  const results = useMemo(
    () => (showError ? [] : filterGlobalSearchCatalogTitles(data ?? [], query)),
    [data, query, showError],
  )

  const trimmedQuery = query.trim()
  const showDropdown = open && trimmedQuery.length > 0
  const showEmpty = showDropdown && !showLoading && !showError && results.length === 0

  const closeDropdown = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
  }, [])

  const finishSearch = useCallback(() => {
    closeDropdown()
    setQuery('')
  }, [closeDropdown])

  const selectEpisode = useCallback(
    (episode: CatalogEpisode) => {
      finishSearch()
      navigate(`/watch/${episode.id}`)
    },
    [finishSearch, navigate],
  )

  useEffect(() => {
    if (!showDropdown) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (rootRef.current && !rootRef.current.contains(target)) {
        closeDropdown()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [closeDropdown, showDropdown])

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDropdown()
        inputRef.current?.focus()
      }
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, results.length - 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (activeIndex >= 0 && results[activeIndex]) {
        selectEpisode(results[activeIndex])
      } else if (results[0]) {
        selectEpisode(results[0])
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      closeDropdown()
      inputRef.current?.focus()
    }
  }

  const highlightedIndex = showDropdown ? activeIndex : -1

  const activeDescendant =
    highlightedIndex >= 0 && results[highlightedIndex]
      ? `${listboxId}-option-${results[highlightedIndex]!.id}`
      : undefined

  let statusAnnouncement = ''
  if (showDropdown) {
    if (showLoading) {
      statusAnnouncement = 'Loading catalog'
    } else if (showError) {
      statusAnnouncement = CATALOG_UNAVAILABLE_MESSAGE
    } else if (showEmpty) {
      statusAnnouncement = 'No matching titles'
    }
  }

  return (
    <div ref={rootRef} className="riffsync-app-shell-search">
      {statusAnnouncement ? <SearchStatusAnnouncement message={statusAnnouncement} /> : null}
      <label className="sr-only" htmlFor="riffsync-global-search">
        Search catalog titles
      </label>
      <div className="riffsync-app-shell-search-box">
        <input
          ref={inputRef}
          id="riffsync-global-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={showDropdown ? activeDescendant : undefined}
          className="riffsync-app-shell-search-input"
          placeholder="Search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(-1)
            setOpen(true)
          }}
          onFocus={() => {
            if (trimmedQuery.length > 0) {
              setOpen(true)
            }
          }}
          onKeyDown={onInputKeyDown}
        />
        <button
          type="button"
          className="riffsync-app-shell-search-submit"
          aria-label="Search"
          onClick={() => {
            if (results[0]) {
              selectEpisode(results[0])
              return
            }
            inputRef.current?.focus()
          }}
        >
          <span className="riffsync-app-shell-topbar-icon">
            <img src="/app-shell/topbar/search.svg" alt="" width={24} height={24} />
          </span>
        </button>
      </div>
      {showDropdown ? (
        <ul id={listboxId} className="riffsync-app-shell-search-listbox" role="listbox">
          {showLoading ? (
            <li className="riffsync-app-shell-search-status" role="presentation">
              Loading catalog…
            </li>
          ) : null}
          {showError ? (
            <li className="riffsync-app-shell-search-status" role="presentation">
              {CATALOG_UNAVAILABLE_MESSAGE}
            </li>
          ) : null}
          {showEmpty ? (
            <li className="riffsync-app-shell-search-status" role="presentation">
              No matching titles
            </li>
          ) : null}
          {!showLoading && !showError
            ? results.map((episode, index) => (
                <GlobalSearchResultRow
                  key={episode.id}
                  episode={episode}
                  active={index === highlightedIndex}
                  optionId={`${listboxId}-option-${episode.id}`}
                  onHighlight={() => setActiveIndex(index)}
                  onWatch={() => selectEpisode(episode)}
                  onAfterAction={finishSearch}
                />
              ))
            : null}
        </ul>
      ) : null}
    </div>
  )
}
