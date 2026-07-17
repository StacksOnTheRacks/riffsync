import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { NavLink, useMatch } from 'react-router-dom'
import { CATALOG_HUB_ENTRY_LINKS } from '../../catalog/catalogBrowseIa'

function CatalogSubcategoryLinks() {
  return (
    <>
      {CATALOG_HUB_ENTRY_LINKS.map(({ label, href }) => (
        <li key={href}>
          <NavLink to={href} end>
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

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleMenu()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      triggerRef.current?.focus()
    }
  }

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
        onKeyDown={onTriggerKeyDown}
      >
        <i className="fa fa-chevron-down" aria-hidden />
      </button>
      <ul id={panelId} className="sub-menu" aria-label="Catalog categories">
        <CatalogSubcategoryLinks />
      </ul>
    </li>
  )
}
