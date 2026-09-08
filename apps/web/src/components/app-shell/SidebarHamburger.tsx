import type { KeyboardEvent } from 'react'

export function SidebarHamburger({
  expanded,
  onToggle,
}: {
  expanded: boolean
  onToggle: () => void
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onToggle()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.currentTarget.focus()
    }
  }

  return (
    <button
      type="button"
      className="riffsync-app-shell-hamburger"
      aria-expanded={expanded}
      aria-controls="riffsync-app-shell-sidebar"
      aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
      onClick={onToggle}
      onKeyDown={onKeyDown}
    >
      <span className="riffsync-app-shell-topbar-icon">
        <img src="/app-shell/topbar/hamburger.svg" alt="" width={24} height={24} />
      </span>
    </button>
  )
}
