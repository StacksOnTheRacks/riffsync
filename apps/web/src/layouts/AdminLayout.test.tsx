// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminSessionState } from '../admin/AdminSessionContext'
import { AdminLayout } from './AdminLayout'

const clearStaffTokens = vi.fn()
const navigate = vi.fn()
const useAdminSession = vi.fn()

vi.mock('../auth/staffTokens', () => ({
  clearStaffTokens: () => clearStaffTokens(),
}))

vi.mock('../admin/AdminSessionContext', () => ({
  useAdminSession: () => useAdminSession(),
  abbreviateStaffGroups: (groups: string[]) =>
    groups.length === 0 ? '(none)' : groups.length <= 2 ? groups.join(', ') : `${groups.slice(0, 2).join(', ')} (+${groups.length - 2})`,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

function mockSessionState(overrides: Partial<AdminSessionState> = {}): AdminSessionState {
  return {
    session: {
      sub: 'staff-sub',
      email: 'op@example.com',
      groups: ['admin', 'curator'],
    },
    loading: false,
    error: null,
    reload: vi.fn(),
    ...overrides,
  }
}

function renderAdminLayout(path = '/admin'): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  useAdminSession.mockReturnValue(mockSessionState())
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<p>Child</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
  })
  return { container, root }
}

describe('AdminLayout', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  beforeEach(() => {
    clearStaffTokens.mockClear()
    navigate.mockClear()
  })

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
    container = null
  })

  it('renders operator nav links and session strip', () => {
    const rendered = renderAdminLayout('/admin')
    root = rendered.root
    container = rendered.container

    const home = container.querySelector('a[href="/admin"]')
    const catalog = container.querySelector('a[href="/admin/catalog"]')
    expect(home?.textContent).toBe('Home')
    expect(catalog?.textContent).toBe('Catalog')
    expect(container.textContent).toContain('op@example.com')
    expect(container.textContent).toContain('admin, curator')
    expect(container.querySelector('#gen-header')).toBeNull()
    expect(container.querySelector('#gen-footer')).toBeNull()
  })

  it('Sign out clears staff tokens and navigates to login', () => {
    const rendered = renderAdminLayout('/admin')
    root = rendered.root
    container = rendered.container

    const signOut = container.querySelector('.riffsync-admin-sign-out') as HTMLButtonElement
    act(() => {
      signOut.click()
    })

    expect(clearStaffTokens).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/admin/login', { replace: true })
  })
})
