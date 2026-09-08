import { Link } from 'react-router-dom'

export type NavigationSlimProps = {
  title: string
  subtitle?: string | null
  leaveHref?: string
  leaveLabel?: string
}

export function NavigationSlim({
  title,
  subtitle,
  leaveHref = '/lobby',
  leaveLabel = 'Leave party',
}: NavigationSlimProps) {
  return (
    <header className="riffsync-navigation-slim" role="banner">
      <div className="riffsync-navigation-slim__inner">
        <Link
          to={leaveHref}
          className="riffsync-navigation-slim__leave gen-button"
          aria-label={leaveLabel}
        >
          <LeaveIcon />
          <span className="riffsync-navigation-slim__leave-text">{leaveLabel}</span>
        </Link>
        <div className="riffsync-navigation-slim__titles">
          <h1 className="riffsync-navigation-slim__title">{title}</h1>
          {subtitle ? (
            <p className="riffsync-navigation-slim__subtitle" aria-live="polite">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M10.09 15.59 11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
      />
    </svg>
  )
}
