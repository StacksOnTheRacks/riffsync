import { useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useCatalogListQuery } from '../catalog/catalogQueries'
import { CatalogLoadErrorPanel } from '../components/catalog/CatalogLoadErrorPanel'
import { CatalogFilterBar } from '../components/catalog/CatalogFilterBar'
import { CatalogPageHeader } from '../components/catalog/CatalogPageHeader'
import { CatalogHubEntryLinks } from '../components/catalog/CatalogHubEntryLinks'
import { CatalogGridCard } from '../components/catalog/CatalogGridCard'
import { useResumePendingPartyRoom } from '../catalog/useResumePendingPartyRoom'
import { catalogEntriesVisibleInPublicBrowse } from '../catalog/catalogPlayback'
import { filterCatalogEntries } from '../catalog/filterCatalogEntries'
import type { CatalogEpisode } from '../catalog/catalogTypes'

const EMPTY_CATALOG_ENTRIES: CatalogEpisode[] = []

export function CatalogPage() {
  const navigate = useNavigate()
  const { data, isPending, isError, error, refetch } = useCatalogListQuery()
  const [titleQuery, setTitleQuery] = useState('')

  useResumePendingPartyRoom(data, navigate)

  const allEntries = data ?? EMPTY_CATALOG_ENTRIES
  const playableEntries = useMemo(
    () => catalogEntriesVisibleInPublicBrowse(allEntries),
    [allEntries],
  )
  const filteredEntries = useMemo(
    () => filterCatalogEntries(playableEntries, { titleQuery, catalogs: [] }),
    [playableEntries, titleQuery],
  )

  const filterBarDisabled = isPending && !data
  const isFilterNoMatch = playableEntries.length > 0 && filteredEntries.length === 0

  if (isPending && !data) {
    return (
      <div className="container">
        <h1>Catalog</h1>
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
      <CatalogPageHeader title="Catalog" subtitle={<CatalogHubEntryLinks />} />
      <section className="gen-section-padding-3">
        <div className="container riffsync-catalog-page">
          <CatalogFilterBar
            titleQuery={titleQuery}
            onTitleQueryChange={setTitleQuery}
            disabled={filterBarDisabled}
            showCatalogChips={false}
          />
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
              <p className="riffsync-catalog-no-match-hint">Clear the search field to see all episodes.</p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
