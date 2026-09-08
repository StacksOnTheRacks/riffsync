export type ChannelViewMode = 'cards' | 'list'

export interface ViewToggleProps {
  view: ChannelViewMode
  onViewChange: (view: ChannelViewMode) => void
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="riffsync-view-toggle" role="group" aria-label="View mode">
      <button
        type="button"
        className={`riffsync-view-toggle__button${view === 'cards' ? ' is-active' : ''}`}
        aria-label="Cards"
        aria-pressed={view === 'cards'}
        onClick={() => onViewChange('cards')}
      >
        <span className="riffsync-view-toggle__icon" aria-hidden="true">
          ▦
        </span>
        <span className="riffsync-view-toggle__label">Cards</span>
      </button>
      <button
        type="button"
        className={`riffsync-view-toggle__button${view === 'list' ? ' is-active' : ''}`}
        aria-label="List"
        aria-pressed={view === 'list'}
        onClick={() => onViewChange('list')}
      >
        <span className="riffsync-view-toggle__icon" aria-hidden="true">
          ☰
        </span>
        <span className="riffsync-view-toggle__label">List</span>
      </button>
    </div>
  )
}
