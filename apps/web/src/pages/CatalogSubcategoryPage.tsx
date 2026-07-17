import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useCatalogListQuery } from '../catalog/catalogQueries'
import { getCatalogSubcategoryByPath } from '../catalog/catalogBrowseIa'
import { CatalogLoadErrorPanel } from '../components/catalog/CatalogLoadErrorPanel'
import { CatalogFilterBar } from '../components/catalog/CatalogFilterBar'
import { CatalogBreadcrumbs } from '../components/catalog/CatalogBreadcrumbs'
import { CatalogGridCard } from '../components/catalog/CatalogGridCard'
import { useResumePendingPartyRoom } from '../catalog/useResumePendingPartyRoom'
import { catalogEntriesWithYoutubeLink } from '../catalog/mockCatalog'
import { filterCatalogEntries } from '../catalog/filterCatalogEntries'

export function CatalogSubcategoryPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const subcategory = getCatalogSubcategoryByPath(pathname)
  const { data, isPending, isError, error, refetch } = useCatalogListQuery()
  const [titleQuery, setTitleQuery] = useState('')

  useResumePendingPartyRoom(data, navigate)

  const allEntries = data ?? []
  const youtubeEntries = useMemo(
    () => catalogEntriesWithYoutubeLink(allEntries),
    [allEntries],
  )
  const filteredEntries = useMemo(
    () =>
      subcategory
        ? filterCatalogEntries(youtubeEntries, { titleQuery, eras: subcategory.eras })
        : [],
    [youtubeEntries, titleQuery, subcategory],
  )

  const filterBarDisabled = isPending && !data
  const isFilterNoMatch = youtubeEntries.length > 0 && filteredEntries.length === 0

  if (!subcategory) {
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
        <h1>{subcategory.label}</h1>
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
    <div className="container riffsync-catalog-page riffsync-catalog-subcategory-page">
      <CatalogBreadcrumbs subcategoryLabel={subcategory.label} />
      <h1>{subcategory.label}</h1>
      <CatalogFilterBar
        titleQuery={titleQuery}
        onTitleQueryChange={setTitleQuery}
        disabled={filterBarDisabled}
        showEraChips={false}
      />
      <div className="riffsync-catalog-grid">
        {filteredEntries.map((ep) => (
          <CatalogGridCard key={ep.id} episode={ep} />
        ))}
      </div>
      {youtubeEntries.length === 0 && (
        <p>
          {allEntries.length === 0
            ? 'No episodes in the catalog yet.'
            : 'No episodes with a YouTube link are listed yet.'}
        </p>
      )}
      {isFilterNoMatch && (
        <div className="riffsync-catalog-no-match">
          <p>No episodes match your filters.</p>
          <p className="riffsync-catalog-no-match-hint">Clear the search field to see all episodes.</p>
        </div>
      )}
    </div>
  )
}
