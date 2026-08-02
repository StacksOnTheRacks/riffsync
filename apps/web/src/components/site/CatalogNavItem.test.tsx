// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CATALOG_HUB_ENTRY_LINKS,
  MST3K_ERA_NAV_LINKS,
  MST3K_SEASON_NAV_LINKS,
  MST3K_SHORTS_NAV_LINK,
} from '../../catalog/catalogBrowseIa'
import { CatalogNavItem } from './CatalogNavItem'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('CatalogNavItem', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderNav(path = '/catalog') {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <ul>
            <CatalogNavItem />
          </ul>
        </MemoryRouter>,
      )
    })
  }

  function catalogNav() {
    return container.querySelector('.riffsync-catalog-nav') as HTMLLIElement
  }

  function subcategoryHrefs(scope: ParentNode) {
    return [...scope.querySelectorAll('a')]
      .map((anchor) => anchor.getAttribute('href'))
      .filter((href): href is string => href?.startsWith('/catalog/') ?? false)
  }

  function subcategoryLabels(scope: ParentNode) {
    return [...scope.querySelectorAll('.sub-menu a')].map((anchor) => anchor.textContent?.trim())
  }

  function topLevelSubmenuLabels(scope: HTMLUListElement) {
    return Array.from(scope.children).map((child) => {
      const directLabel = Array.from(child.children).find(
        (entry) => entry.tagName === 'A' || entry.classList.contains('riffsync-catalog-nav__nested-label'),
      )
      return directLabel?.textContent?.trim()
    })
  }

  it('keeps Catalog parent links navigable to /catalog', () => {
    renderNav('/')

    const parent = Array.from(catalogNav().children).find(
      (child) => child.tagName === 'A' && child.getAttribute('href') === '/catalog',
    )

    expect(parent?.textContent?.trim()).toBe('Catalog')
  })

  it('lists public categories and nested MST3K filter destinations in Streamlab sub-menus', () => {
    renderNav('/catalog')

    const submenu = Array.from(catalogNav().children).find((child) =>
      child.classList.contains('sub-menu'),
    ) as HTMLUListElement | undefined

    expect(submenu).toBeDefined()
    expect(topLevelSubmenuLabels(submenu!)).toEqual(CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.label))
    expect(subcategoryHrefs(submenu!)).toEqual(
      expect.arrayContaining([
        ...CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.href),
        ...MST3K_SEASON_NAV_LINKS.map((entry) => entry.href),
        ...MST3K_ERA_NAV_LINKS.map((entry) => entry.href),
        MST3K_SHORTS_NAV_LINK.href,
      ]),
    )
    expect(subcategoryLabels(submenu!)).toEqual(
      expect.arrayContaining([
        'MST3K',
        'Season 1',
        'Season 12',
        'Joel',
        'Emily',
        'Shorts',
        'Community',
        'Riff Material',
      ]),
    )
    expect(catalogNav().classList.contains('menu-item-has-children')).toBe(true)
    expect(container.textContent).not.toContain('other')
    expect(container.textContent).not.toContain('Movie Night')
  })

  it('marks the catalog nav item active on subcategory routes', () => {
    renderNav('/catalog/mst3k')

    expect(catalogNav().classList.contains('active')).toBe(true)
  })

  it('exposes disclosure semantics and keyboard toggling on the Streamlab chevron', () => {
    renderNav('/catalog')

    const navItem = catalogNav()
    const trigger = navItem.querySelector('.riffsync-catalog-nav__submenu-toggle') as HTMLButtonElement
    const panel = navItem.querySelector('.sub-menu') as HTMLUListElement

    expect(trigger.getAttribute('aria-haspopup')).toBe('true')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.classList.contains('gen-submenu-icon')).toBe(true)
    expect(panel.hidden).toBe(false)
    expect(navItem.classList.contains('is-open')).toBe(false)

    act(() => {
      trigger.focus()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(navItem.classList.contains('is-open')).toBe(true)

    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(navItem.classList.contains('is-open')).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('expands the same sub-menu inline inside the mobile navbar collapse', () => {
    renderNav('/catalog')

    const collapse = document.createElement('div')
    collapse.className = 'navbar-collapse show'
    const navItem = catalogNav()
    collapse.appendChild(navItem!)
    container.appendChild(collapse)

    const trigger = navItem.querySelector('.riffsync-catalog-nav__submenu-toggle') as HTMLButtonElement
    const panel = navItem.querySelector('.sub-menu') as HTMLUListElement

    expect(collapse.contains(panel)).toBe(true)
    expect(navItem.classList.contains('is-open')).toBe(false)

    act(() => {
      trigger.click()
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(navItem.classList.contains('is-open')).toBe(true)
    expect(subcategoryHrefs(panel)).toEqual(
      expect.arrayContaining([
        ...CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.href),
        ...MST3K_SEASON_NAV_LINKS.map((entry) => entry.href),
        ...MST3K_ERA_NAV_LINKS.map((entry) => entry.href),
        MST3K_SHORTS_NAV_LINK.href,
      ]),
    )

    act(() => {
      trigger.focus()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(navItem.classList.contains('is-open')).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('keyboard toggles nested MST3K disclosure parents', () => {
    renderNav('/catalog')

    const mst3kItem = container.querySelector('.riffsync-catalog-nav__nested-item') as HTMLLIElement
    const trigger = mst3kItem.querySelector('.riffsync-catalog-nav__nested-toggle') as HTMLButtonElement

    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    act(() => {
      trigger.focus()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(mst3kItem.classList.contains('is-open')).toBe(true)

    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(mst3kItem.classList.contains('is-open')).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })
})
