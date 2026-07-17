// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CATALOG_HUB_ENTRY_LINKS } from '../../catalog/catalogBrowseIa'
import { CatalogNavItem } from './CatalogNavItem'

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

  function desktopRoot() {
    return container.querySelector('.riffsync-catalog-nav__desktop')
  }

  function mobileRoot() {
    return container.querySelector('.riffsync-catalog-nav__mobile')
  }

  function subcategoryHrefs(scope: ParentNode) {
    return [...scope.querySelectorAll('a')]
      .map((anchor) => anchor.getAttribute('href'))
      .filter((href): href is string => href?.startsWith('/catalog/') ?? false)
  }

  function subcategoryLabels(scope: ParentNode) {
    return [...scope.querySelectorAll('.riffsync-catalog-nav__dropdown a, .riffsync-catalog-nav__accordion-panel a')].map(
      (anchor) => anchor.textContent?.trim(),
    )
  }

  it('keeps Catalog parent links navigable to /catalog', () => {
    renderNav('/')

    const desktopParent = desktopRoot()?.querySelector('a[href="/catalog"]')
    const mobileParent = mobileRoot()?.querySelector('a[href="/catalog"]')

    expect(desktopParent?.textContent?.trim()).toBe('Catalog')
    expect(mobileParent?.textContent?.trim()).toBe('Catalog')
  })

  it('lists the four public subcategory destinations in order on desktop and mobile', () => {
    renderNav('/catalog')

    const expectedHrefs = CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.href)
    const expectedLabels = CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.label)

    expect(subcategoryHrefs(desktopRoot()!)).toEqual(expectedHrefs)
    expect(subcategoryHrefs(mobileRoot()!)).toEqual(expectedHrefs)
    expect(subcategoryLabels(container)).toEqual([...expectedLabels, ...expectedLabels])
    expect(container.textContent).not.toContain('other')
  })

  it('marks the catalog nav item active on subcategory routes', () => {
    renderNav('/catalog/mst3k')

    expect(container.querySelector('.riffsync-catalog-nav')?.classList.contains('active')).toBe(true)
  })

  it('exposes desktop disclosure semantics and keyboard toggling', () => {
    renderNav('/catalog')

    const trigger = desktopRoot()?.querySelector('.riffsync-catalog-nav__disclosure-trigger') as HTMLButtonElement
    const panel = desktopRoot()?.querySelector('.riffsync-catalog-nav__dropdown') as HTMLUListElement

    expect(trigger.getAttribute('aria-haspopup')).toBe('true')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hidden).toBe(true)

    act(() => {
      trigger.focus()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hidden).toBe(false)

    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hidden).toBe(true)
    expect(document.activeElement).toBe(trigger)
  })

  it('expands the mobile accordion inline inside the nav item', () => {
    renderNav('/catalog')

    const collapse = document.createElement('div')
    collapse.className = 'navbar-collapse show'
    const navItem = container.querySelector('.riffsync-catalog-nav')
    collapse.appendChild(navItem!)
    container.appendChild(collapse)

    const trigger = mobileRoot()?.querySelector('.riffsync-catalog-nav__accordion-trigger') as HTMLButtonElement
    const panel = mobileRoot()?.querySelector('.riffsync-catalog-nav__accordion-panel') as HTMLUListElement

    expect(collapse.contains(panel)).toBe(true)
    expect(panel.hidden).toBe(true)

    act(() => {
      trigger.click()
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hidden).toBe(false)
    expect(subcategoryHrefs(panel)).toEqual(CATALOG_HUB_ENTRY_LINKS.map((entry) => entry.href))

    act(() => {
      trigger.focus()
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hidden).toBe(true)
    expect(document.activeElement).toBe(trigger)
  })
})
