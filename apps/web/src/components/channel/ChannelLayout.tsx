import { useState, type ReactNode } from 'react'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import type { SelectedMst3kTagPills } from '../../catalog/mst3kTagFilters'
import { CatalogFilterBar } from '../catalog/CatalogFilterBar'
import { Mst3kCatalogTagFilterBar } from '../catalog/Mst3kCatalogTagFilterBar'
import {
  ChannelHero,
  MST3K_CHANNEL_AVATAR_URL,
  MST3K_CHANNEL_COVER_URL,
  MST3K_CHANNEL_VISUAL_TITLE,
} from './ChannelHero'
import { ViewToggle, type ChannelViewMode } from './ViewToggle'
import { ChannelMovieCard } from './ChannelMovieCard'
import { ChannelListRow } from './ChannelListRow'

export interface ChannelLayoutProps {
  subtitle?: ReactNode
  filteredEntries: CatalogEpisode[]
  routeCatalogEntries: CatalogEpisode[]
  titleQuery: string
  onTitleQueryChange: (query: string) => void
  filterBarDisabled: boolean
  showMst3kTagPills: boolean
  selectedTagPills: SelectedMst3kTagPills
  onSelectedTagPillsChange: (pills: SelectedMst3kTagPills) => void
  playableEntries: CatalogEpisode[]
  allEntries: CatalogEpisode[]
  isFilterNoMatch: boolean
  hasActiveTagPills: boolean
}

export function ChannelLayout({
  subtitle,
  filteredEntries,
  routeCatalogEntries,
  titleQuery,
  onTitleQueryChange,
  filterBarDisabled,
  showMst3kTagPills,
  selectedTagPills,
  onSelectedTagPillsChange,
  playableEntries,
  allEntries,
  isFilterNoMatch,
  hasActiveTagPills,
}: ChannelLayoutProps) {
  const [view, setView] = useState<ChannelViewMode>('cards')

  return (
    <div className="riffsync-channel-layout">
      <h1 className="sr-only">MST3K</h1>
      <ChannelHero
        coverUrl={MST3K_CHANNEL_COVER_URL}
        avatarUrl={MST3K_CHANNEL_AVATAR_URL}
        visualTitle={MST3K_CHANNEL_VISUAL_TITLE}
        subtitle={subtitle}
      />
      <section className="riffsync-channel-layout__body">
        <div className="container riffsync-channel-layout__container">
          <CatalogFilterBar
            titleQuery={titleQuery}
            onTitleQueryChange={onTitleQueryChange}
            disabled={filterBarDisabled}
            showCatalogChips={false}
          />
          {showMst3kTagPills ? (
            <Mst3kCatalogTagFilterBar
              entries={routeCatalogEntries}
              selectedTagPills={selectedTagPills}
              onSelectedTagPillsChange={onSelectedTagPillsChange}
              disabled={filterBarDisabled}
            />
          ) : null}
          <div className="riffsync-channel-layout__toolbar">
            <ViewToggle view={view} onViewChange={setView} />
          </div>
          {view === 'cards' ? (
            <div className="riffsync-channel-card-grid">
              {filteredEntries.map((episode) => (
                <ChannelMovieCard key={episode.id} episode={episode} />
              ))}
            </div>
          ) : (
            <div className="riffsync-channel-list">
              {filteredEntries.map((episode) => (
                <ChannelListRow key={episode.id} episode={episode} />
              ))}
            </div>
          )}
          {playableEntries.length === 0 ? (
            <p>
              {allEntries.length === 0
                ? 'No episodes in the catalog yet.'
                : 'No episodes are available for in-app playback yet.'}
            </p>
          ) : null}
          {isFilterNoMatch ? (
            <div className="riffsync-catalog-no-match">
              <p>No episodes match your filters.</p>
              <p className="riffsync-catalog-no-match-hint">
                {hasActiveTagPills || titleQuery.trim()
                  ? 'Clear the search field and tag pills to see all episodes.'
                  : 'Clear the search field to see all episodes.'}
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
