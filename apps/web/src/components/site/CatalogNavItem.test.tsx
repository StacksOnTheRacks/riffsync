// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CATALOG_HUB_ENTRY_LINKS } from '../../catalog/catalogBrowseIa'
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

  it('keeps Catalog parent links navigable to /catalog', () => {
    renderNav('/')

    const parent = Array.from(catalogNav().children).find(
      (child) => child.tagName === 'A' && child.getAttribute('href') === '/catalog',
    )

    expect(parent?.textContent?.trim()).toBe('Catalog')
  })

  it('lists the public subcategory destinations in order in a Streamlab sub-menu', () => {
    renderNav('/catalog')

    const expectedHrefs = CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.href)
    const expectedLabels = CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.label)
    const submenu = Array.from(catalogNav().children).find((child) =>
      child.classList.contains('sub-menu'),
    ) as HTMLUListElement | undefined

    expect(submenu).toBeDefined()
    expect(subcategoryHrefs(submenu!)).toEqual(expectedHrefs)
    expect(subcategoryLabels(submenu!)).toEqual(expectedLabels)
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
    expect(subcategoryHrefs(panel)).toEqual(CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.href))

    act(() => {
      trigger.focus()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(navItem.classList.contains('is-open')).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })
})
