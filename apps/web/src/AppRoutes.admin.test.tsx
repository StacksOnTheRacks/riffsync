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

vi.mock('./api/staffAdminCatalogApi', () => ({
  fetchStaffCatalogList: vi.fn().mockResolvedValue({
    version: 1,
    entries: [
      {
        id: 'ep-route-test',
        experimentNumber: 42,
        title: 'Route Test Episode',
        era: 'joel',
        youtubeVideoId: null,
        youtubeWatchUrl: null,
        tagline: null,
        posterImageUrl: null,
        backdropImageUrl: null,
        tmdbMovieId: null,
        tmdbArtworkSyncedAt: null,
        carousel: false,
        spotlight: false,
        movieSearchTitle: null,
        embedAllows: true,
        curatorNotes: null,
        youtubeThumbnailUrl: null,
      },
    ],
  }),
  StaffSessionUnauthorizedError: class StaffSessionUnauthorizedError extends Error {},
  StaffSessionForbiddenError: class StaffSessionForbiddenError extends Error {},
}))

vi.mock('./api/staffAdminEmailApi', () => ({
  fetchStaffEmailAudience: vi.fn().mockResolvedValue({ eligibleCount: 2 }),
  sendStaffEmailTest: vi.fn(),
  sendStaffEmailBroadcast: vi.fn(),
  StaffSessionUnauthorizedError: class StaffSessionUnauthorizedError extends Error {},
  StaffSessionForbiddenError: class StaffSessionForbiddenError extends Error {},
  StaffEmailValidationError: class StaffEmailValidationError extends Error {},
  StaffEmailConflictError: class StaffEmailConflictError extends Error {},
  StaffEmailDisabledError: class StaffEmailDisabledError extends Error {},
}))

describe('AppRoutes admin tree', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
  })

  it('renders catalog list inside admin shell without fan header', async () => {
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
      expect(container.textContent).toContain('Route Test Episode')
    })

    expect(container.querySelector('.riffsync-admin-catalog-table')).not.toBeNull()

    expect(container.querySelector('.riffsync-admin-shell')).not.toBeNull()
    expect(container.querySelector('#gen-header')).toBeNull()
    expect(container.querySelector('#gen-footer')).toBeNull()
  })
})
