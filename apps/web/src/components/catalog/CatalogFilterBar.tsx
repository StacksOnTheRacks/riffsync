import {
  PUBLIC_CATALOG_CATEGORIES,
  formatCatalogLabel,
  type CatalogCategory,
} from '../../catalog/catalogTypes'

export interface CatalogFilterBarProps {
  selectedCatalogs?: CatalogCategory[]
  onSelectedCatalogsChange?: (catalogs: CatalogCategory[]) => void
  titleQuery: string
  onTitleQueryChange: (query: string) => void
  disabled?: boolean
  /** When false, catalog-chip toggles are hidden (catalog hub). Defaults to true. */
  showCatalogChips?: boolean
}

function toggleCatalog(
  selectedCatalogs: CatalogCategory[],
  catalog: CatalogCategory,
): CatalogCategory[] {
  if (selectedCatalogs.includes(catalog)) {
    return selectedCatalogs.filter((entry) => entry !== catalog)
  }
  return [...selectedCatalogs, catalog]
}

export function CatalogFilterBar({
  selectedCatalogs = [],
  onSelectedCatalogsChange,
  titleQuery,
  onTitleQueryChange,
  disabled = false,
  showCatalogChips = true,
}: CatalogFilterBarProps) {
  return (
    <div className="riffsync-catalog-filter-bar">
      {showCatalogChips && onSelectedCatalogsChange && (
        <div className="riffsync-catalog-filter-bar__era-group" role="group" aria-label="Filter by catalog">
          {PUBLIC_CATALOG_CATEGORIES.map((catalog) => {
            const selected = selectedCatalogs.includes(catalog)
            return (
              <button
                key={catalog}
                type="button"
                className={
                  selected
                    ? 'riffsync-catalog-filter-bar__era riffsync-catalog-filter-bar__era--selected'
                    : 'riffsync-catalog-filter-bar__era'
                }
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onSelectedCatalogsChange(toggleCatalog(selectedCatalogs, catalog))}
              >
                {formatCatalogLabel(catalog)}
              </button>
            )
          })}
        </div>
      )}
      <label className="riffsync-catalog-filter-bar__title">
        <span className="sr-only">Search by title</span>
        <input
          type="search"
          value={titleQuery}
          onChange={(e) => onTitleQueryChange(e.target.value)}
          placeholder="Search by title, tag, or label"
          disabled={disabled}
        />
      </label>
    </div>
  )
}
