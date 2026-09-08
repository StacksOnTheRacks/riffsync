import { forwardRef, type ReactNode } from 'react'
import { NavLink, useMatch } from 'react-router-dom'
import {
  CATALOG_SUBCATEGORIES,
  MST3K_ERA_NAV_LINKS,
  MST3K_SEASON_NAV_LINKS,
  MST3K_SHORTS_NAV_LINK,
  RIFFTRAX_MOVIES_NAV_LINK,
  RIFFTRAX_SHORTS_NAV_LINK,
} from '../../catalog/catalogBrowseIa'
import { useShowGetAppNav } from '../../pwa/useShowGetAppNav'

function SidebarNavItem({
  to,
  end,
  label,
  iconClass,
  collapsed,
}: {
  to: string
  end?: boolean
  label: string
  iconClass: string
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
        <i className={iconClass} aria-hidden />
        <span className="riffsync-app-shell-nav-label">{label}</span>
      </NavLink>
    </li>
  )
}

function SidebarNestedGroup({
  label,
  linkTo,
  active,
  children,
}: {
  label: string
  linkTo: string
  active: boolean
  children: ReactNode
}) {
  return (
    <li
      className={`riffsync-app-shell-nav-nested-group${active ? ' is-active' : ''}`}
    >
      <NavLink to={linkTo} end={false} className="riffsync-app-shell-nav-nested-group-link">
        {label}
      </NavLink>
      <ul className="riffsync-app-shell-nav-nested">{children}</ul>
    </li>
  )
}

function SidebarNestedLink({ to, label }: { to: string; label: string }) {
  return (
    <li className="riffsync-app-shell-nav-nested-item">
      <NavLink to={to} end>
        {label}
      </NavLink>
    </li>
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
  const showGetAppNav = useShowGetAppNav()
  const catalogActive = Boolean(useMatch({ path: '/catalog', end: false }))
  const mst3kSubcategory = CATALOG_SUBCATEGORIES.find((entry) => entry.slug === 'mst3k')
  const rifftraxSubcategory = CATALOG_SUBCATEGORIES.find((entry) => entry.slug === 'rifftrax')
  const leafSubcategories = CATALOG_SUBCATEGORIES.filter(
    (entry) => entry.slug !== 'mst3k' && entry.slug !== 'rifftrax',
  )

  const className = [
    'riffsync-app-shell-sidebar',
    collapsed ? 'is-collapsed' : 'is-expanded',
    mobileOpen ? 'is-mobile-open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <aside ref={ref} id={id} className={className} aria-label="Primary">
      <nav className="riffsync-app-shell-sidebar-nav" onClick={onNavigate}>
        <ul className="riffsync-app-shell-nav-list">
          <SidebarNavItem to="/" end label="Home" iconClass="fa fa-home" collapsed={collapsed} />
          <SidebarNavItem
            to="/catalog"
            end={false}
            label="Catalog"
            iconClass="fa fa-th-large"
            collapsed={collapsed}
          />
          {!collapsed ? (
            <li className="riffsync-app-shell-nav-catalog-nested">
              <ul className="riffsync-app-shell-nav-nested" aria-label="Catalog categories">
                {mst3kSubcategory ? (
                  <SidebarNestedGroup
                    label={mst3kSubcategory.label}
                    linkTo={mst3kSubcategory.path}
                    active={catalogActive}
                  >
                    <li className="riffsync-app-shell-nav-nested-heading">By Season</li>
                    {MST3K_SEASON_NAV_LINKS.map(({ href, label }) => (
                      <SidebarNestedLink key={href} to={href} label={label} />
                    ))}
                    <li className="riffsync-app-shell-nav-nested-heading">By Era</li>
                    {MST3K_ERA_NAV_LINKS.map(({ href, label }) => (
                      <SidebarNestedLink key={href} to={href} label={label} />
                    ))}
                    <SidebarNestedLink to={MST3K_SHORTS_NAV_LINK.href} label={MST3K_SHORTS_NAV_LINK.label} />
                  </SidebarNestedGroup>
                ) : null}
                {rifftraxSubcategory ? (
                  <SidebarNestedGroup
                    label={rifftraxSubcategory.label}
                    linkTo={rifftraxSubcategory.path}
                    active={catalogActive}
                  >
                    <SidebarNestedLink to={RIFFTRAX_MOVIES_NAV_LINK.href} label={RIFFTRAX_MOVIES_NAV_LINK.label} />
                    <SidebarNestedLink to={RIFFTRAX_SHORTS_NAV_LINK.href} label={RIFFTRAX_SHORTS_NAV_LINK.label} />
                  </SidebarNestedGroup>
                ) : null}
                {leafSubcategories.map(({ label, path }) => (
                  <SidebarNestedLink key={path} to={path} label={label} />
                ))}
              </ul>
            </li>
          ) : null}
          <SidebarNavItem to="/lobby" label="Lobby" iconClass="fa fa-users" collapsed={collapsed} />
          {showGetAppNav ? (
            <SidebarNavItem to="/download" label="Get App" iconClass="fa fa-download" collapsed={collapsed} />
          ) : null}
        </ul>
      </nav>
    </aside>
  )
})
