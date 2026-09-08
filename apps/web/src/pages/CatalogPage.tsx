import { useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { useCatalogListQuery } from '../catalog/catalogQueries'
import { CatalogLoadErrorPanel } from '../components/catalog/CatalogLoadErrorPanel'
import { CatalogPageHeader } from '../components/catalog/CatalogPageHeader'
import { CatalogHubEntryLinks } from '../components/catalog/CatalogHubEntryLinks'
import { CatalogGridCard } from '../components/catalog/CatalogGridCard'
import { useResumePendingPartyRoom } from '../catalog/useResumePendingPartyRoom'
import { catalogEntriesVisibleInPublicBrowse } from '../catalog/catalogPlayback'
import type { CatalogEpisode } from '../catalog/catalogTypes'

const EMPTY_CATALOG_ENTRIES: CatalogEpisode[] = []

export function CatalogPage() {
  const navigate = useNavigate()
  const { data, isPending, isError, error, refetch } = useCatalogListQuery()

  useResumePendingPartyRoom(data, navigate)

  const allEntries = data ?? EMPTY_CATALOG_ENTRIES
  const playableEntries = useMemo(
    () => catalogEntriesVisibleInPublicBrowse(allEntries),
    [allEntries],
  )

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
          <div className="riffsync-catalog-grid">
            {playableEntries.map((ep) => (
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
        </div>
      </section>
    </>
  )
}
