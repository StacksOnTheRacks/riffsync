import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useMatch } from 'react-router-dom'
import {
  CATALOG_SUBCATEGORIES,
  MST3K_ERA_NAV_LINKS,
  MST3K_SEASON_NAV_LINKS,
  MST3K_SHORTS_NAV_LINK,
  RIFFTRAX_MOVIES_NAV_LINK,
  RIFFTRAX_SHORTS_NAV_LINK,
} from '../../catalog/catalogBrowseIa'

function onDisclosureKeyDown({
  event,
  toggle,
  close,
  focusTarget,
}: {
  event: KeyboardEvent<HTMLButtonElement>
  toggle: () => void
  close: () => void
  focusTarget: HTMLButtonElement | null
}) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggle()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    focusTarget?.focus()
  }
}

function NestedDisclosureItem({
  label,
  ariaLabel,
  children,
  linkTo,
}: {
  label: string
  ariaLabel: string
  children: ReactNode
  linkTo?: string
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const closeMenu = useCallback(() => {
    setOpen(false)
  }, [])

  const openMenu = useCallback(() => {
    setOpen(true)
  }, [])

  const toggleMenu = useCallback(() => {
    setOpen((current) => !current)
  }, [])

  return (
    <li
      className={`menu-item menu-item-has-children riffsync-catalog-nav__nested-item${open ? ' is-open' : ''}`}
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
    >
      {linkTo ? (
        <NavLink to={linkTo} end={false}>
          {label}
        </NavLink>
      ) : (
        <span className="riffsync-catalog-nav__nested-label">{label}</span>
      )}
      <button
        ref={triggerRef}
        type="button"
        className="gen-submenu-icon riffsync-catalog-nav__submenu-toggle riffsync-catalog-nav__nested-toggle"
        aria-label={ariaLabel}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggleMenu}
        onKeyDown={(event) =>
          onDisclosureKeyDown({
            event,
            toggle: toggleMenu,
            close: closeMenu,
            focusTarget: triggerRef.current,
          })
        }
      >
        <i className="fa fa-chevron-down" aria-hidden />
      </button>
      <ul id={panelId} className="sub-menu" aria-label={ariaLabel.replace(/^Show /, '')}>
        {children}
      </ul>
    </li>
  )
}

function CatalogSubcategoryLinks() {
  const mst3kSubcategory = CATALOG_SUBCATEGORIES.find((entry) => entry.slug === 'mst3k')
  const rifftraxSubcategory = CATALOG_SUBCATEGORIES.find((entry) => entry.slug === 'rifftrax')
  const leafSubcategories = CATALOG_SUBCATEGORIES.filter(
    (entry) => entry.slug !== 'mst3k' && entry.slug !== 'rifftrax',
  )

  return (
    <>
      {mst3kSubcategory ? (
        <NestedDisclosureItem
          label={mst3kSubcategory.label}
          linkTo={mst3kSubcategory.path}
          ariaLabel="Show MST3K catalog filters"
        >
          <NestedDisclosureItem label="By Season" ariaLabel="Show MST3K season links">
            {MST3K_SEASON_NAV_LINKS.map(({ href, label }) => (
              <li key={href} className="menu-item">
                <NavLink to={href} end>
                  {label}
                </NavLink>
              </li>
            ))}
          </NestedDisclosureItem>
          <NestedDisclosureItem label="By Era" ariaLabel="Show MST3K era links">
            {MST3K_ERA_NAV_LINKS.map(({ href, label }) => (
              <li key={href} className="menu-item">
                <NavLink to={href} end>
                  {label}
                </NavLink>
              </li>
            ))}
          </NestedDisclosureItem>
          <li className="menu-item">
            <NavLink to={MST3K_SHORTS_NAV_LINK.href} end>
              {MST3K_SHORTS_NAV_LINK.label}
            </NavLink>
          </li>
        </NestedDisclosureItem>
      ) : null}
      {rifftraxSubcategory ? (
        <NestedDisclosureItem
          label={rifftraxSubcategory.label}
          linkTo={rifftraxSubcategory.path}
          ariaLabel="Show RiffTrax catalog filters"
        >
          <li className="menu-item">
            <NavLink to={RIFFTRAX_MOVIES_NAV_LINK.href} end>
              {RIFFTRAX_MOVIES_NAV_LINK.label}
            </NavLink>
          </li>
          <li className="menu-item">
            <NavLink to={RIFFTRAX_SHORTS_NAV_LINK.href} end>
              {RIFFTRAX_SHORTS_NAV_LINK.label}
            </NavLink>
          </li>
        </NestedDisclosureItem>
      ) : null}
      {leafSubcategories.map(({ label, path }) => (
        <li key={path} className="menu-item">
          <NavLink to={path} end>
            {label}
          </NavLink>
        </li>
      ))}
    </>
  )
}

export function CatalogNavItem() {
  const catalogActive = !!useMatch({ path: '/catalog', end: false })
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const closeMenu = useCallback(() => {
    setOpen(false)
  }, [])

  const openMenu = useCallback(() => {
    setOpen(true)
  }, [])

  const toggleMenu = useCallback(() => {
    setOpen((current) => !current)
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      const root = triggerRef.current?.closest('.riffsync-catalog-nav')
      if (root && !root.contains(target)) {
        closeMenu()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [closeMenu, open])

  return (
    <li
      className={`menu-item menu-item-has-children riffsync-catalog-nav${catalogActive ? ' active' : ''}${open ? ' is-open' : ''}`}
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
    >
      <NavLink to="/catalog" end={false}>
        Catalog
      </NavLink>
      <button
        ref={triggerRef}
        type="button"
        className="gen-submenu-icon riffsync-catalog-nav__submenu-toggle"
        aria-label="Show catalog categories"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggleMenu}
        onKeyDown={(event) =>
          onDisclosureKeyDown({
            event,
            toggle: toggleMenu,
            close: closeMenu,
            focusTarget: triggerRef.current,
          })
        }
      >
        <i className="fa fa-chevron-down" aria-hidden />
      </button>
      <ul id={panelId} className="sub-menu" aria-label="Catalog categories">
        <CatalogSubcategoryLinks />
      </ul>
    </li>
  )
}
