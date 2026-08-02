import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useCatalogListQuery } from '../catalog/catalogQueries'
import { getCatalogBrowseViewByPath } from '../catalog/catalogBrowseIa'
import { CatalogLoadErrorPanel } from '../components/catalog/CatalogLoadErrorPanel'
import { CatalogFilterBar } from '../components/catalog/CatalogFilterBar'
import { Mst3kCatalogTagFilterBar } from '../components/catalog/Mst3kCatalogTagFilterBar'
import { CatalogPageHeader } from '../components/catalog/CatalogPageHeader'
import { CatalogGridCard } from '../components/catalog/CatalogGridCard'
import { useResumePendingPartyRoom } from '../catalog/useResumePendingPartyRoom'
import { catalogEntriesPlayableInApp } from '../catalog/catalogPlayback'
import {
  EMPTY_MST3K_TAG_PILLS,
  filterMst3kCatalogEntriesByRouteFilter,
  filterMst3kCatalogEntries,
  type SelectedMst3kTagPills,
} from '../catalog/mst3kTagFilters'
import { filterCatalogEntries } from '../catalog/filterCatalogEntries'
import type { CatalogEpisode } from '../catalog/catalogTypes'

const EMPTY_CATALOG_ENTRIES: CatalogEpisode[] = []

export function CatalogSubcategoryPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const browseView = getCatalogBrowseViewByPath(pathname)
  const subcategory = browseView?.subcategory
  const { data, isPending, isError, error, refetch } = useCatalogListQuery()
  const [titleQuery, setTitleQuery] = useState('')
  const [selectedTagPills, setSelectedTagPills] = useState<SelectedMst3kTagPills>(EMPTY_MST3K_TAG_PILLS)
  const isMst3kRoute = subcategory?.slug === 'mst3k'
  const showMst3kTagPills = browseView?.mst3kRouteFilter?.kind === 'all'

  useResumePendingPartyRoom(data, navigate)

  const allEntries = data ?? EMPTY_CATALOG_ENTRIES
  const playableEntries = useMemo(
    () => catalogEntriesPlayableInApp(allEntries),
    [allEntries],
  )
  const baseCatalogEntries = useMemo(
    () =>
      subcategory
        ? filterCatalogEntries(playableEntries, { titleQuery: '', catalogs: [subcategory.catalog] })
        : [],
    [playableEntries, subcategory],
  )
  const routeCatalogEntries = useMemo(
    () =>
      isMst3kRoute
        ? filterMst3kCatalogEntriesByRouteFilter(
            baseCatalogEntries,
            browseView?.mst3kRouteFilter,
          )
        : baseCatalogEntries,
    [baseCatalogEntries, browseView, isMst3kRoute],
  )
  const filteredEntries = useMemo(
    () =>
      subcategory
        ? isMst3kRoute
          ? filterMst3kCatalogEntries(routeCatalogEntries, {
              titleQuery,
              catalogs: [subcategory.catalog],
              selectedTagPills: showMst3kTagPills ? selectedTagPills : EMPTY_MST3K_TAG_PILLS,
            })
          : filterCatalogEntries(playableEntries, { titleQuery, catalogs: [subcategory.catalog] })
        : [],
    [
      routeCatalogEntries,
      playableEntries,
      titleQuery,
      subcategory,
      isMst3kRoute,
      selectedTagPills,
      showMst3kTagPills,
    ],
  )

  const filterBarDisabled = isPending && !data
  const hasActiveTagPills =
    showMst3kTagPills && (selectedTagPills.Era.length > 0 || selectedTagPills.Season.length > 0)
  const isFilterNoMatch = isMst3kRoute
    ? routeCatalogEntries.length > 0 && filteredEntries.length === 0
    : playableEntries.length > 0 && filteredEntries.length === 0

  if (!browseView) {
    return (
      <div className="container">
        <h1>Catalog</h1>
        <p>That catalog category was not found.</p>
        <p>
          <Link to="/catalog">← Catalog</Link>
        </p>
      </div>
    )
  }

  if (isPending && !data) {
    return (
      <div className="container">
        <h1>{browseView?.title}</h1>
        <p>Loading…</p>
      </div>
    )
  }

  if (isError && !data) {
    return (
      <div className="container">
        <CatalogLoadErrorPanel
          error={error}
          onRetry={() => {
            void refetch()
          }}
          homeLink
        />
      </div>
    )
  }

  return (
    <>
      <CatalogPageHeader title={browseView.title} subtitle={browseView.subtitle} />
      <section className="gen-section-padding-3">
        <div className="container riffsync-catalog-page riffsync-catalog-subcategory-page">
          <CatalogFilterBar
            titleQuery={titleQuery}
            onTitleQueryChange={setTitleQuery}
            disabled={filterBarDisabled}
            showCatalogChips={false}
          />
          {showMst3kTagPills && (
            <Mst3kCatalogTagFilterBar
              entries={routeCatalogEntries}
              selectedTagPills={selectedTagPills}
              onSelectedTagPillsChange={setSelectedTagPills}
              disabled={filterBarDisabled}
            />
          )}
          <div className="riffsync-catalog-grid">
            {filteredEntries.map((ep) => (
              <CatalogGridCard key={ep.id} episode={ep} />
            ))}
          </div>
          {playableEntries.length === 0 && (
            <p>
              {allEntries.length === 0
                ? 'No episodes in the catalog yet.'
                : 'No episodes are available for in-app playback yet.'}
            </p>
          )}
          {isFilterNoMatch && (
            <div className="riffsync-catalog-no-match">
              <p>No episodes match your filters.</p>
              <p className="riffsync-catalog-no-match-hint">
                {hasActiveTagPills || titleQuery.trim()
                  ? 'Clear the search field and tag pills to see all episodes.'
                  : 'Clear the search field to see all episodes.'}
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
