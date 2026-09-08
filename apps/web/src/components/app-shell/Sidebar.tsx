import { forwardRef, useEffect, useState } from 'react'
import { NavLink, useMatch } from 'react-router-dom'
import { useFanSession } from '../../auth/useFanSession'
import {
  CATALOG_SUBCATEGORIES,
  type CatalogSubcategorySlug,
} from '../../catalog/catalogBrowseIa'
import { FanAvatarThumb } from '../FanAvatarThumb'
import { fetchFriendRosterSnapshot, type FriendEntry } from '../../friends/friendsApi'
import { useShowGetAppNav } from '../../pwa/useShowGetAppNav'

const SIDEBAR_ICON = {
  home: '/app-shell/sidebar/home.svg',
  live: '/app-shell/sidebar/live.svg',
  yourParties: '/app-shell/sidebar/your-parties.svg',
  mst3k: '/app-shell/sidebar/mst3k.jpg',
  rifftrax: '/app-shell/sidebar/rifftrax.png',
  community: '/app-shell/sidebar/community.svg',
  riffMaterial: '/app-shell/sidebar/riff-material.svg',
  movies: '/app-shell/sidebar/movies.svg',
  tvShows: '/app-shell/sidebar/tv-shows.svg',
  settings: '/app-shell/sidebar/settings.svg',
  howToHost: '/app-shell/sidebar/how-to-host.svg',
  sendFeedback: '/app-shell/sidebar/send-feedback.svg',
  downloadApp: '/app-shell/sidebar/download-app.svg',
  showMore: '/app-shell/sidebar/show-more.svg',
} as const

const CATALOG_ICONS: Record<CatalogSubcategorySlug, { src: string; variant: 'glyph' | 'logo' | 'wordmark' }> = {
  mst3k: { src: SIDEBAR_ICON.mst3k, variant: 'logo' },
  rifftrax: { src: SIDEBAR_ICON.rifftrax, variant: 'wordmark' },
  community: { src: SIDEBAR_ICON.community, variant: 'glyph' },
  'riff-material': { src: SIDEBAR_ICON.riffMaterial, variant: 'glyph' },
  movies: { src: SIDEBAR_ICON.movies, variant: 'glyph' },
  'tv-shows': { src: SIDEBAR_ICON.tvShows, variant: 'glyph' },
}

const FRIENDS_PREVIEW_COUNT = 7
const SEND_FEEDBACK_HREF = 'https://github.com/StacksOnTheRacks/riffsync/discussions'

function SidebarIcon({
  src,
  variant = 'glyph',
}: {
  src: string
  variant?: 'glyph' | 'logo' | 'wordmark'
}) {
  return (
    <span className={`riffsync-app-shell-nav-icon riffsync-app-shell-nav-icon--${variant}`}>
      <img src={src} alt="" width={24} height={24} />
    </span>
  )
}

function SidebarNavItem({
  to,
  end,
  label,
  iconSrc,
  iconVariant = 'glyph',
  collapsed,
}: {
  to: string
  end?: boolean
  label: string
  iconSrc: string
  iconVariant?: 'glyph' | 'logo' | 'wordmark'
  collapsed: boolean
}) {
  const match = useMatch({ path: to, end: end ?? true })
  const active = Boolean(match)

  return (
    <li className={`riffsync-app-shell-nav-item${active ? ' is-active' : ''}`}>
      <NavLink
        to={to}
        end={end ?? true}
        aria-label={collapsed ? label : undefined}
        title={collapsed ? label : undefined}
      >
        <SidebarIcon src={iconSrc} variant={iconVariant} />
        <span className="riffsync-app-shell-nav-label">{label}</span>
      </NavLink>
    </li>
  )
}

function SidebarExternalItem({
  href,
  label,
  iconSrc,
  collapsed,
}: {
  href: string
  label: string
  iconSrc: string
  collapsed: boolean
}) {
  return (
    <li className="riffsync-app-shell-nav-item">
      <a
        href={href}
        rel="noopener noreferrer"
        aria-label={collapsed ? label : undefined}
        title={collapsed ? label : undefined}
      >
        <SidebarIcon src={iconSrc} />
        <span className="riffsync-app-shell-nav-label">{label}</span>
      </a>
    </li>
  )
}

function useSidebarFriends(enabled: boolean): FriendEntry[] {
  const [friends, setFriends] = useState<FriendEntry[]>([])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const controller = new AbortController()
    void fetchFriendRosterSnapshot('', controller.signal)
      .then((snapshot) => {
        if (!controller.signal.aborted) {
          setFriends(snapshot?.friends ?? [])
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFriends([])
        }
      })

    return () => controller.abort()
  }, [enabled])

  return enabled ? friends : []
}

function SidebarFriends({
  friends,
  collapsed,
}: {
  friends: FriendEntry[]
  collapsed: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hiddenCount = Math.max(0, friends.length - FRIENDS_PREVIEW_COUNT)
  const visible = expanded ? friends : friends.slice(0, FRIENDS_PREVIEW_COUNT)

  if (collapsed || friends.length === 0) {
    return null
  }

  return (
    <div className="riffsync-app-shell-nav-section">
      <p className="riffsync-app-shell-nav-heading">Friends</p>
      <ul className="riffsync-app-shell-nav-list" aria-label="Friends">
        {visible.map((friend) => (
          <li key={friend.pairKey} className="riffsync-app-shell-nav-item riffsync-app-shell-nav-item--friend">
            <span className="riffsync-app-shell-nav-friend">
              <span className="riffsync-app-shell-nav-icon riffsync-app-shell-nav-icon--logo">
                <FanAvatarThumb displayName={friend.displayName} avatarUrl={friend.avatarUrl} sizePx={24} />
              </span>
              <span className="riffsync-app-shell-nav-label">{friend.displayName}</span>
            </span>
          </li>
        ))}
        {hiddenCount > 0 && !expanded ? (
          <li className="riffsync-app-shell-nav-item">
            <button
              type="button"
              className="riffsync-app-shell-nav-more"
              onClick={() => setExpanded(true)}
            >
              <SidebarIcon src={SIDEBAR_ICON.showMore} />
              <span className="riffsync-app-shell-nav-label">Show {hiddenCount} more</span>
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

type SidebarProps = {
  id: string
  collapsed: boolean
  mobileOpen: boolean
  onNavigate?: () => void
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { id, collapsed, mobileOpen, onNavigate },
  ref,
) {
  const { fanToken } = useFanSession()
  const signedIn = Boolean(fanToken)
  const showGetAppNav = useShowGetAppNav()
  const friends = useSidebarFriends(signedIn)

  const className = [
    'riffsync-app-shell-sidebar',
    collapsed ? 'is-collapsed' : 'is-expanded',
    mobileOpen ? 'is-mobile-open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const year = new Date().getFullYear()

  return (
    <aside ref={ref} id={id} className={className} aria-label="Primary">
      <nav
        className="riffsync-app-shell-sidebar-nav"
        onClick={(event) => {
          const target = event.target
          if (target instanceof Element && target.closest('a')) {
            onNavigate?.()
          }
        }}
      >
        <ul className="riffsync-app-shell-nav-list">
          <SidebarNavItem to="/" end label="Home" iconSrc={SIDEBAR_ICON.home} collapsed={collapsed} />
          <SidebarNavItem to="/live" label="Live Now" iconSrc={SIDEBAR_ICON.live} collapsed={collapsed} />
          {signedIn ? (
            <SidebarNavItem
              to="/your-parties"
              label="Your Parties"
              iconSrc={SIDEBAR_ICON.yourParties}
              collapsed={collapsed}
            />
          ) : null}
        </ul>

        <div className="riffsync-app-shell-nav-rule" aria-hidden />

        <ul className="riffsync-app-shell-nav-list" aria-label="Channels">
          {CATALOG_SUBCATEGORIES.map((entry) => {
            const icon = CATALOG_ICONS[entry.slug]
            const nested = entry.slug === 'mst3k' || entry.slug === 'rifftrax'
            return (
              <SidebarNavItem
                key={entry.path}
                to={entry.path}
                end={!nested}
                label={entry.label}
                iconSrc={icon.src}
                iconVariant={icon.variant}
                collapsed={collapsed}
              />
            )
          })}
        </ul>

        {signedIn ? (
          <>
            <div className="riffsync-app-shell-nav-rule" aria-hidden />
            <SidebarFriends friends={friends} collapsed={collapsed} />
            {friends.length > 0 && !collapsed ? (
              <div className="riffsync-app-shell-nav-rule" aria-hidden />
            ) : null}
            <ul className="riffsync-app-shell-nav-list">
              <SidebarNavItem
                to="/account"
                label="Settings"
                iconSrc={SIDEBAR_ICON.settings}
                collapsed={collapsed}
              />
              <SidebarNavItem
                to="/how-to-host-a-watchparty"
                label="How to Host"
                iconSrc={SIDEBAR_ICON.howToHost}
                collapsed={collapsed}
              />
              <SidebarExternalItem
                href={SEND_FEEDBACK_HREF}
                label="Send Feedback"
                iconSrc={SIDEBAR_ICON.sendFeedback}
                collapsed={collapsed}
              />
            </ul>
          </>
        ) : null}

        {showGetAppNav ? (
          <>
            <div className="riffsync-app-shell-nav-rule" aria-hidden />
            <div className="riffsync-app-shell-nav-section">
              <p className="riffsync-app-shell-nav-heading" hidden={collapsed}>
                More from RiffSync
              </p>
              <ul className="riffsync-app-shell-nav-list">
                <SidebarNavItem
                  to="/download"
                  label="Download App"
                  iconSrc={SIDEBAR_ICON.downloadApp}
                  collapsed={collapsed}
                />
              </ul>
            </div>
          </>
        ) : null}

        <div className="riffsync-app-shell-nav-rule" aria-hidden />

        <div className="riffsync-app-shell-nav-footer" hidden={collapsed}>
          <ul className="riffsync-app-shell-nav-legal" aria-label="Legal">
            <li>
              <NavLink to="/terms">Terms</NavLink>
            </li>
            <li>
              <NavLink to="/privacy">Privacy</NavLink>
            </li>
            <li>
              <NavLink to="/privacy">Policy &amp; Safety</NavLink>
            </li>
          </ul>
          <p className="riffsync-app-shell-nav-copyright">© {year} Galaxy Class, LLC</p>
        </div>
      </nav>
    </aside>
  )
})
