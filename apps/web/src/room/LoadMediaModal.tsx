import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CATALOG_UNAVAILABLE_MESSAGE } from '../catalog/catalogLoadError'
import { useCatalogListQuery } from '../catalog/catalogQueries'
import { catalogEntriesPlayableInApp } from '../catalog/catalogPlayback'
import { filterCatalogEntries } from '../catalog/filterCatalogEntries'
import type { CatalogCategory, CatalogEpisode } from '../catalog/catalogTypes'
import {
  loadMediaCategoryLabel,
  loadMediaSidebarCategories,
} from './loadMediaCategories'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

type LoadMediaModalProps = {
  selectedCatalogEpisodeId: string
  applying: boolean
  applyError: string | null
  onCancel: () => void
  onConfirm: (episode: CatalogEpisode) => void
}

export function LoadMediaModal({
  selectedCatalogEpisodeId,
  applying,
  applyError,
  onCancel,
  onConfirm,
}: LoadMediaModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const catalogQuery = useCatalogListQuery()
  const [titleQuery, setTitleQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<CatalogCategory>('mst3k')

  const playableEntries = useMemo(
    () => catalogEntriesPlayableInApp(catalogQuery.data ?? []),
    [catalogQuery.data],
  )

  const sidebarCategories = useMemo(
    () => loadMediaSidebarCategories(playableEntries),
    [playableEntries],
  )

  useEffect(() => {
    const selected = playableEntries.find((ep) => ep.id === selectedCatalogEpisodeId)
    if (selected && sidebarCategories.includes(selected.catalog)) {
      setActiveCategory(selected.catalog)
    } else if (sidebarCategories.length > 0) {
      setActiveCategory(sidebarCategories[0]!)
    }
  }, [playableEntries, selectedCatalogEpisodeId, sidebarCategories])

  const tableRows = useMemo(
    () =>
      filterCatalogEntries(playableEntries, {
        titleQuery,
        catalogs: [activeCategory],
      }),
    [playableEntries, titleQuery, activeCategory],
  )

  const trapFocus = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
    )
    if (focusables.length === 0) return
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }, [onCancel])

  useEffect(() => {
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0)
    window.addEventListener('keydown', trapFocus)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', trapFocus)
    }
  }, [trapFocus])

  const showLoading = catalogQuery.isPending && (catalogQuery.data?.length ?? 0) === 0
  const showError = catalogQuery.isError && (catalogQuery.data?.length ?? 0) === 0

  return (
    <div className="riffsync-load-media-overlay" role="presentation" onClick={onCancel}>
      <div
        ref={dialogRef}
        className="riffsync-load-media"
        role="dialog"
        aria-modal="true"
        aria-labelledby="riffsync-load-media-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="riffsync-load-media-title" className="sr-only">
          Load Media
        </h2>
        <div className="riffsync-load-media__body">
          <nav className="riffsync-load-media__sidebar" aria-label="Catalog categories">
            <ul className="riffsync-load-media__categories">
              {sidebarCategories.map((category) => (
                <li key={category}>
                  <button
                    type="button"
                    className={
                      activeCategory === category
                        ? 'riffsync-load-media__category riffsync-load-media__category--active'
                        : 'riffsync-load-media__category'
                    }
                    aria-current={activeCategory === category ? 'true' : undefined}
                    onClick={() => setActiveCategory(category)}
                  >
                    {loadMediaCategoryLabel(category)}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="riffsync-load-media__main">
            <label className="sr-only" htmlFor="riffsync-load-media-search">
              Search catalog titles
            </label>
            <input
              ref={searchRef}
              id="riffsync-load-media-search"
              type="search"
              className="riffsync-load-media__search"
              placeholder="Search"
              value={titleQuery}
              onChange={(e) => setTitleQuery(e.target.value)}
              autoComplete="off"
            />
            <div
              className="riffsync-load-media__table-wrap"
              aria-busy={showLoading || applying ? 'true' : undefined}
            >
              {showLoading ? (
                <p className="riffsync-load-media__status riffsync-muted">Loading catalog…</p>
              ) : showError ? (
                <div className="riffsync-load-media__status" role="alert">
                  <p>{CATALOG_UNAVAILABLE_MESSAGE}</p>
                  <button
                    type="button"
                    className="gen-button"
                    onClick={() => void catalogQuery.refetch()}
                  >
                    Retry
                  </button>
                </div>
              ) : tableRows.length === 0 ? (
                <p className="riffsync-load-media__status riffsync-muted">No matching titles.</p>
              ) : (
                <table className="riffsync-load-media__table">
                  <caption className="sr-only">
                    Playable titles in {loadMediaCategoryLabel(activeCategory)}
                  </caption>
                  <tbody>
                    {tableRows.map((episode) => {
                      const selected = episode.id === selectedCatalogEpisodeId
                      return (
                        <tr
                          key={episode.id}
                          className={
                            selected
                              ? 'riffsync-load-media__row riffsync-load-media__row--selected'
                              : 'riffsync-load-media__row'
                          }
                          aria-selected={selected ? 'true' : 'false'}
                        >
                          <td className="riffsync-load-media__poster-cell">
                            {episode.posterImageUrl ? (
                              <img
                                src={episode.posterImageUrl}
                                alt={episode.title}
                                className="riffsync-load-media__poster"
                              />
                            ) : (
                              <span
                                className="riffsync-load-media__poster riffsync-load-media__poster--empty"
                                aria-hidden
                              />
                            )}
                          </td>
                          <td className="riffsync-load-media__title-cell">{episode.title}</td>
                          <td className="riffsync-load-media__action-cell">
                            <button
                              type="button"
                              className="riffsync-load-media__load-btn"
                              disabled={applying}
                              aria-label={`Load media: ${episode.title}`}
                              onClick={() => onConfirm(episode)}
                            >
                              LOAD MEDIA
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {applyError ? (
              <p className="riffsync-load-media__apply-err" role="alert">
                {applyError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
