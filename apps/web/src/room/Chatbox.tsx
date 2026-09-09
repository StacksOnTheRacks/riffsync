import type { ReactNode } from 'react'
import type { RoomSidebarTab } from './roomPageTypes'

export type ChatboxTab = Extract<RoomSidebarTab, 'chat' | 'people' | 'friends'>

export type ChatboxTabConfig = {
  id: ChatboxTab
  label: string
  ariaLabel?: string
  unreadDot?: boolean
}

export type ChatboxTabListProps = {
  activeTab: RoomSidebarTab
  tabs: ChatboxTabConfig[]
  onSelectTab: (tab: RoomSidebarTab) => void
}

export function ChatboxTabList({ activeTab, tabs, onSelectTab }: ChatboxTabListProps) {
  return (
    <div className="riffsync-chatbox__toolbar">
      <div className="riffsync-chatbox__tabs riffsync-room-page__tabs" role="tablist" aria-label="Chat panel">
        {tabs.map((tab) => {
          const selected = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`riffsync-chatbox-tab-${tab.id}`}
              aria-controls={`riffsync-chatbox-panel-${tab.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={`riffsync-chatbox__tab riffsync-room-page__tab${selected ? ' riffsync-chatbox__tab--on riffsync-room-page__tab--on' : ''}`}
              aria-label={tab.ariaLabel ?? tab.label}
              onClick={() => onSelectTab(tab.id)}
            >
              {tab.label}
              {tab.unreadDot ? (
                <span className="riffsync-chatbox__tab-unread-dot riffsync-room-page__tab-unread-dot" aria-hidden="true" />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export type ChatboxProps = {
  presentation: 'sidebar' | 'overlay'
  children: ReactNode
  className?: string
}

export function Chatbox({ presentation, children, className }: ChatboxProps) {
  const rootClass = [
    'riffsync-chatbox',
    presentation === 'overlay' ? 'riffsync-chatbox--overlay' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <aside className={rootClass} aria-label={presentation === 'overlay' ? 'Chat overlay' : 'Party chat'}>
      <div className="riffsync-chatbox__body">{children}</div>
    </aside>
  )
}

export function ChatboxPanel({
  tabId,
  activeTab,
  labelledBy,
  children,
  className,
}: {
  tabId: RoomSidebarTab
  activeTab: RoomSidebarTab
  labelledBy?: string
  children: ReactNode
  className?: string
}) {
  if (activeTab !== tabId) return null
  const panelClass = ['riffsync-chatbox__panel', className].filter(Boolean).join(' ')
  return (
    <div
      role="tabpanel"
      id={`riffsync-chatbox-panel-${tabId}`}
      aria-labelledby={labelledBy ?? `riffsync-chatbox-tab-${tabId}`}
      className={panelClass}
    >
      {children}
    </div>
  )
}
