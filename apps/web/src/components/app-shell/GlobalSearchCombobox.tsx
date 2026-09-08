import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { CATALOG_UNAVAILABLE_MESSAGE } from '../../catalog/catalogLoadError'
import { useCatalogListQuery } from '../../catalog/catalogQueries'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import { filterGlobalSearchCatalogTitles } from './filterGlobalSearchResults'

function SearchStatusAnnouncement({ message }: { message: string }) {
  return (
    <div className="sr-only" aria-live="polite">
      {message}
    </div>
  )
}

export function GlobalSearchCombobox() {
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { data, isPending, isError } = useCatalogListQuery()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const entries = data ?? []
  const hasCache = entries.length > 0 || data !== undefined
  const showLoading = isPending && !hasCache
  const showError = isError && !hasCache

  const results = useMemo(
    () => (showError ? [] : filterGlobalSearchCatalogTitles(entries, query)),
    [entries, query, showError],
  )

  const trimmedQuery = query.trim()
  const showDropdown = open && trimmedQuery.length > 0
  const showEmpty = showDropdown && !showLoading && !showError && results.length === 0

  const closeDropdown = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
  }, [])

  const selectEpisode = useCallback(
    (episode: CatalogEpisode) => {
      closeDropdown()
      setQuery('')
      navigate(`/watch/${episode.id}`)
    },
    [closeDropdown, navigate],
  )

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

  useEffect(() => {
    if (!showDropdown) {
      setActiveIndex(-1)
    }
  }, [showDropdown, query])

  const activeDescendant =
    activeIndex >= 0 && results[activeIndex]
      ? `${listboxId}-option-${results[activeIndex]!.id}`
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
    <div className="riffsync-app-shell-search">
      {statusAnnouncement ? <SearchStatusAnnouncement message={statusAnnouncement} /> : null}
      <label className="sr-only" htmlFor="riffsync-global-search">
        Search catalog titles
      </label>
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
        placeholder="Search titles"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          if (trimmedQuery.length > 0) {
            setOpen(true)
          }
        }}
        onKeyDown={onInputKeyDown}
      />
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
                <li
                  key={episode.id}
                  id={`${listboxId}-option-${episode.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={
                    index === activeIndex ? 'riffsync-app-shell-search-option is-active' : 'riffsync-app-shell-search-option'
                  }
                >
                  <button
                    type="button"
                    className="riffsync-app-shell-search-option-btn"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectEpisode(episode)}
                  >
                    {episode.title}
                  </button>
                </li>
              ))
            : null}
        </ul>
      ) : null}
    </div>
  )
}
