// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminCatalogListPage } from './AdminCatalogListPage'
import type { StaffCatalogEpisode } from '../../api/staffAdminCatalogApi'

const fetchStaffCatalogList = vi.fn()
const refreshStaffTokensIfStale = vi.fn()
const getStaffAccessToken = vi.fn()

vi.mock('../../auth/staffHostedUiPkce', () => ({
  refreshStaffTokensIfStale: () => refreshStaffTokensIfStale(),
}))

vi.mock('../../auth/staffTokens', () => ({
  getStaffAccessToken: () => getStaffAccessToken(),
}))

vi.mock('../../api/staffAdminCatalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/staffAdminCatalogApi')>()
  return {
    ...actual,
    fetchStaffCatalogList: (...args: unknown[]) => fetchStaffCatalogList(...args),
  }
})

const baseEpisode: StaffCatalogEpisode = {
  id: 'ep-1',
  experimentNumber: 101,
  title: 'Pod People',
  catalog: 'mst3k',
  tags: ['Era: Joel'],
  labels: ['Joel'],
  youtubeVideoId: 'abc',
  youtubeWatchUrl: null,
  tagline: null,
  posterImageUrl: 'https://cdn.test/poster.jpg',
  backdropImageUrl: null,
  tmdbMovieId: null,
  tmdbArtworkSyncedAt: null,
  carousel: true,
  spotlight: false,
  movieSearchTitle: null,
  embedAllows: true,
  youtubeThumbnailUrl: null,
}

describe('AdminCatalogListPage', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    refreshStaffTokensIfStale.mockResolvedValue(undefined)
    getStaffAccessToken.mockReturnValue('staff-token')
    fetchStaffCatalogList.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
  })

  function renderPage(initialEntry = '/admin/catalog') {
    act(() => {
      root!.render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <AdminCatalogListPage />
        </MemoryRouter>,
      )
    })
  }

  it('renders table columns and edit links from staff catalog API', async () => {
    fetchStaffCatalogList.mockResolvedValue({
      version: 1,
      entries: [
        baseEpisode,
        {
          ...baseEpisode,
          id: 'no-yt',
          experimentNumber: 202,
          title: 'No Tube',
          youtubeVideoId: null,
          posterImageUrl: null,
          youtubeThumbnailUrl: 'https://cdn.test/yt-thumb.jpg',
        },
      ],
    })

    renderPage()

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Pod People')
    })

    expect(fetchStaffCatalogList).toHaveBeenCalledWith('staff-token')
    expect(container.querySelector('.riffsync-admin-catalog-table')).not.toBeNull()
    expect(container.querySelector('th')?.textContent).toBe('id')
    const editLink = container.querySelector('a.riffsync-admin-catalog-edit-link') as HTMLAnchorElement
    expect(editLink?.getAttribute('href')).toBe('/admin/catalog/ep-1/edit')
    expect(container.textContent).toContain('No Tube')
    expect(container.textContent).toContain('Yes')
  })

  it('shows empty catalog copy when API returns no entries', async () => {
    fetchStaffCatalogList.mockResolvedValue({ version: 1, entries: [] })
    renderPage()

    await vi.waitFor(() => {
      expect(container.textContent).toContain('No episodes in catalog yet.')
    })
  })

  it('shows post-save banner from location state', async () => {
    fetchStaffCatalogList.mockResolvedValue({ version: 1, entries: [baseEpisode] })

    act(() => {
      root!.render(
        <MemoryRouter
          initialEntries={[{ pathname: '/admin/catalog', state: { saved: true } }]}
        >
          <AdminCatalogListPage />
        </MemoryRouter>,
      )
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[role="status"]')?.textContent).toContain('Episode saved')
    })
  })
})
