import { useCallback, useEffect, useId, useRef, useState } from 'react'
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
  const [desktopOpen, setDesktopOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const desktopTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)
  const desktopPanelId = useId()
  const mobilePanelId = useId()

  const closeDesktop = useCallback(() => {
    setDesktopOpen(false)
  }, [])

  const toggleDesktop = useCallback(() => {
    setDesktopOpen((open) => !open)
  }, [])

  const toggleMobile = useCallback(() => {
    setMobileOpen((open) => !open)
  }, [])

  const onDesktopTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleDesktop()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDesktop()
      desktopTriggerRef.current?.focus()
    }
  }

  const onMobileTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleMobile()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setMobileOpen(false)
      mobileTriggerRef.current?.focus()
    }
  }

  useEffect(() => {
    if (!desktopOpen) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      const root = desktopTriggerRef.current?.closest('.riffsync-catalog-nav__desktop')
      if (root && !root.contains(target)) {
        closeDesktop()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [closeDesktop, desktopOpen])

  return (
    <li className={`menu-item riffsync-catalog-nav${catalogActive ? ' active' : ''}`}>
      <div
        className="riffsync-catalog-nav__desktop"
        onMouseEnter={() => setDesktopOpen(true)}
        onMouseLeave={closeDesktop}
      >
        <NavLink to="/catalog" end={false}>
          Catalog
        </NavLink>
        <button
          ref={desktopTriggerRef}
          type="button"
          className="riffsync-catalog-nav__disclosure-trigger"
          aria-label="Show catalog categories"
          aria-haspopup="true"
          aria-expanded={desktopOpen}
          aria-controls={desktopPanelId}
          onClick={toggleDesktop}
          onKeyDown={onDesktopTriggerKeyDown}
        >
          <span aria-hidden="true">▾</span>
        </button>
        <ul
          id={desktopPanelId}
          className={`riffsync-catalog-nav__dropdown${desktopOpen ? ' is-open' : ''}`}
          hidden={!desktopOpen}
        >
          <CatalogSubcategoryLinks />
        </ul>
      </div>

      <div className="riffsync-catalog-nav__mobile">
        <div className="riffsync-catalog-nav__mobile-row">
          <NavLink to="/catalog" end={false}>
            Catalog
          </NavLink>
          <button
            ref={mobileTriggerRef}
            type="button"
            className="riffsync-catalog-nav__accordion-trigger"
            aria-label="Expand catalog categories"
            aria-expanded={mobileOpen}
            aria-controls={mobilePanelId}
            onClick={toggleMobile}
            onKeyDown={onMobileTriggerKeyDown}
          >
            <span aria-hidden="true">{mobileOpen ? '▴' : '▾'}</span>
          </button>
        </div>
        <ul
          id={mobilePanelId}
          className={`riffsync-catalog-nav__accordion-panel${mobileOpen ? ' is-open' : ''}`}
          hidden={!mobileOpen}
        >
          <CatalogSubcategoryLinks />
        </ul>
      </div>
    </li>
  )
}
