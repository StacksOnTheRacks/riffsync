import { formatCatalogLabel, type CatalogEpisode } from '../../catalog/catalogTypes'
import { catalogCardImageUrl } from '../../catalog/mockCatalog'
import { EpisodeTileActions } from '../catalog/EpisodeTileActions'
import { searchResultTagChips } from './filterGlobalSearchResults'

export function GlobalSearchResultRow({
  episode,
  active,
  optionId,
  onHighlight,
  onWatch,
  onAfterAction,
}: {
  episode: CatalogEpisode
  active: boolean
  optionId: string
  onHighlight: () => void
  onWatch: () => void
  onAfterAction: () => void
}) {
  const category = formatCatalogLabel(episode.catalog)
  const tags = searchResultTagChips(episode)
  const poster = catalogCardImageUrl(episode)

  return (
    <li
      id={optionId}
      role="option"
      aria-selected={active}
      aria-label={`${episode.title}, ${category}`}
      className={
        active ? 'riffsync-app-shell-search-option is-active' : 'riffsync-app-shell-search-option'
      }
      onMouseEnter={onHighlight}
    >
      <div className="riffsync-app-shell-search-result">
        <button
          type="button"
          className="riffsync-app-shell-search-option-btn"
          onClick={onWatch}
        >
          <span className="riffsync-app-shell-search-result-poster">
            <img src={poster} alt="" width={72} height={40} />
          </span>
          <span className="riffsync-app-shell-search-result-copy">
            <span className="riffsync-app-shell-search-result-title">{episode.title}</span>
            <span className="riffsync-app-shell-search-result-meta">
              <span className="riffsync-app-shell-search-result-category">{category}</span>
              {tags.map((tag) => (
                <span key={tag} className="riffsync-app-shell-search-result-tag">
                  {tag}
                </span>
              ))}
            </span>
          </span>
        </button>
        <div className="riffsync-app-shell-search-option-actions">
          <EpisodeTileActions
            episode={episode}
            layout="inline"
            watchLabel="Watch"
            onAfterAction={onAfterAction}
          />
        </div>
      </div>
    </li>
  )
}
