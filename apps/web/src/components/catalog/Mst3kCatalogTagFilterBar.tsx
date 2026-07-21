import {
  deriveMst3kTagPillOptions,
  MST3K_TAG_PILL_NAMESPACES,
  toggleMst3kTagPill,
  type Mst3kTagPillNamespace,
  type SelectedMst3kTagPills,
} from '../../catalog/mst3kTagFilters'
import type { CatalogEpisode } from '../../catalog/catalogTypes'

export interface Mst3kCatalogTagFilterBarProps {
  entries: readonly CatalogEpisode[]
  selectedTagPills: SelectedMst3kTagPills
  onSelectedTagPillsChange: (next: SelectedMst3kTagPills) => void
  disabled?: boolean
}

function renderTagGroup(
  namespace: Mst3kTagPillNamespace,
  options: readonly string[],
  selectedTagPills: SelectedMst3kTagPills,
  onSelectedTagPillsChange: (next: SelectedMst3kTagPills) => void,
  disabled: boolean,
) {
  if (options.length === 0) {
    return null
  }

  const selected = selectedTagPills[namespace]

  return (
    <div
      key={namespace}
      className="riffsync-catalog-filter-bar__era-group riffsync-catalog-filter-bar__tag-group"
      role="group"
      aria-label={`Filter by ${namespace}`}
    >
      <span className="riffsync-catalog-filter-bar__tag-group-label">{namespace}</span>
      {options.map((tag) => {
        const isSelected = selected.includes(tag)
        return (
          <button
            key={tag}
            type="button"
            className={
              isSelected
                ? 'riffsync-catalog-filter-bar__era riffsync-catalog-filter-bar__era--selected'
                : 'riffsync-catalog-filter-bar__era'
            }
            aria-pressed={isSelected}
            aria-label={tag}
            disabled={disabled}
            onClick={() => onSelectedTagPillsChange(toggleMst3kTagPill(selectedTagPills, tag))}
          >
            {tag}
          </button>
        )
      })}
    </div>
  )
}

export function Mst3kCatalogTagFilterBar({
  entries,
  selectedTagPills,
  onSelectedTagPillsChange,
  disabled = false,
}: Mst3kCatalogTagFilterBarProps) {
  const groups = MST3K_TAG_PILL_NAMESPACES.map((namespace) =>
    renderTagGroup(
      namespace,
      deriveMst3kTagPillOptions(entries, namespace),
      selectedTagPills,
      onSelectedTagPillsChange,
      disabled,
    ),
  ).filter(Boolean)

  if (groups.length === 0) {
    return null
  }

  return <div className="riffsync-catalog-filter-bar__tag-groups">{groups}</div>
}
