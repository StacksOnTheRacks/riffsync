// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './AppRoutes'

vi.mock('./auth/StaffSessionKeepAlive', () => ({
  StaffSessionKeepAlive: () => null,
}))

vi.mock('./auth/staffHostedUiPkce', () => ({
  refreshStaffTokensIfStale: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./auth/staffTokens', () => ({
  getStaffAccessToken: () => 'staff-token',
  clearStaffTokens: vi.fn(),
}))

vi.mock('./api/staffAdminSessionApi', () => ({
  fetchStaffSession: vi.fn().mockResolvedValue({
    sub: 'staff-1',
    email: 'op@example.com',
    groups: ['admin'],
  }),
  StaffSessionUnauthorizedError: class StaffSessionUnauthorizedError extends Error {},
  StaffSessionForbiddenError: class StaffSessionForbiddenError extends Error {},
}))

describe('AppRoutes admin tree', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
  })

  it('renders catalog placeholder inside admin shell without fan header', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <MemoryRouter initialEntries={['/admin/catalog']}>
          <AppRoutes />
        </MemoryRouter>,
      )
    })

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Catalog list UI ships')
    })

    expect(container.querySelector('.riffsync-admin-shell')).not.toBeNull()
    expect(container.querySelector('#gen-header')).toBeNull()
    expect(container.querySelector('#gen-footer')).toBeNull()
  })
})
