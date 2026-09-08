import { useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import type { SelectedMst3kTagPills } from '../../catalog/mst3kTagFilters'
import { Mst3kCatalogTagFilterBar } from '../catalog/Mst3kCatalogTagFilterBar'
import { ChannelHero } from './ChannelHero'
import { ChannelSectionTabs, getChannelToolbarTabs } from './ChannelSectionTabs'
import type { ChannelAvatarVariant } from './channelSurfaceConfig'
import { ViewToggle, type ChannelViewMode } from './ViewToggle'
import { ChannelMovieCard } from './ChannelMovieCard'
import { ChannelListRow } from './ChannelListRow'

export interface ChannelLayoutProps {
  srOnlyHeading: string
  coverUrl: string
  avatarUrl: string
  avatarVariant?: ChannelAvatarVariant
  visualTitle: string
  subtitle?: ReactNode
  filteredEntries: CatalogEpisode[]
  routeCatalogEntries: CatalogEpisode[]
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
  srOnlyHeading,
  coverUrl,
  avatarUrl,
  avatarVariant,
  visualTitle,
  subtitle,
  filteredEntries,
  routeCatalogEntries,
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
  const { pathname } = useLocation()
  const tabs = getChannelToolbarTabs(pathname)

  return (
    <div className="riffsync-channel-layout">
      <h1 className="sr-only">{srOnlyHeading}</h1>
      <ChannelHero
        coverUrl={coverUrl}
        avatarUrl={avatarUrl}
        avatarVariant={avatarVariant}
        visualTitle={visualTitle}
        subtitle={subtitle}
        toolbar={
          <>
            <ChannelSectionTabs tabs={tabs} pathname={pathname} />
            <ViewToggle view={view} onViewChange={setView} />
          </>
        }
      />
      <section className="riffsync-channel-layout__body">
        <div className="container riffsync-channel-layout__container">
          {showMst3kTagPills ? (
            <Mst3kCatalogTagFilterBar
              entries={routeCatalogEntries}
              selectedTagPills={selectedTagPills}
              onSelectedTagPillsChange={onSelectedTagPillsChange}
              disabled={filterBarDisabled}
            />
          ) : null}
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
                {hasActiveTagPills
                  ? 'Clear the tag pills to see all episodes.'
                  : 'Clear the filters to see all episodes.'}
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
