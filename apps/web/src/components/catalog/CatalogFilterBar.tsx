import { PUBLIC_CATALOG_ERAS, formatCatalogEraLabel, type CatalogEra } from '../../catalog/catalogTypes'

export interface CatalogFilterBarProps {
  selectedEras: CatalogEra[]
  onSelectedErasChange: (eras: CatalogEra[]) => void
  titleQuery: string
  onTitleQueryChange: (query: string) => void
  disabled?: boolean
}

function toggleEra(selectedEras: CatalogEra[], era: CatalogEra): CatalogEra[] {
  if (selectedEras.includes(era)) {
    return selectedEras.filter((e) => e !== era)
  }
  return [...selectedEras, era]
}

export function CatalogFilterBar({
  selectedEras,
  onSelectedErasChange,
  titleQuery,
  onTitleQueryChange,
  disabled = false,
}: CatalogFilterBarProps) {
  return (
    <div className="riffsync-catalog-filter-bar">
      <div className="riffsync-catalog-filter-bar__era-group" role="group" aria-label="Filter by era">
        {PUBLIC_CATALOG_ERAS.map((era) => {
          const selected = selectedEras.includes(era)
          return (
            <button
              key={era}
              type="button"
              className={
                selected
                  ? 'riffsync-catalog-filter-bar__era riffsync-catalog-filter-bar__era--selected'
                  : 'riffsync-catalog-filter-bar__era'
              }
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onSelectedErasChange(toggleEra(selectedEras, era))}
            >
              {formatCatalogEraLabel(era)}
            </button>
          )
        })}
      </div>
      <label className="riffsync-catalog-filter-bar__title">
        <span className="sr-only">Search by title</span>
        <input
          type="search"
          value={titleQuery}
          onChange={(e) => onTitleQueryChange(e.target.value)}
          placeholder="Search by title"
          disabled={disabled}
        />
      </label>
    </div>
  )
}
