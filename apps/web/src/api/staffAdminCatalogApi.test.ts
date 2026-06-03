import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchStaffCatalogEpisode,
  fetchStaffCatalogList,
} from './staffAdminCatalogApi'
import {
  StaffSessionForbiddenError,
  StaffSessionUnauthorizedError,
} from './staffAdminSessionApi'

vi.mock('../config/apiBaseUrl', () => ({
  getPublicApiBaseUrl: () => 'https://api.example.test',
}))

describe('staffAdminCatalogApi', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchStaffCatalogList hits list URL with bearer auth', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ version: 1, entries: [] }),
    })

    const result = await fetchStaffCatalogList('staff-token')

    expect(result.version).toBe(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.test/v1/admin/catalog')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer staff-token',
      Accept: 'application/json',
    })
  })

  it('fetchStaffCatalogEpisode encodes episode id in path', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entry: { id: 'ep/special' } }),
    })

    await fetchStaffCatalogEpisode('staff-token', 'ep/special')

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.test/v1/admin/catalog/episodes/ep%2Fspecial')
  })

  it('maps 401 to StaffSessionUnauthorizedError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '',
    })

    await expect(fetchStaffCatalogList('bad')).rejects.toBeInstanceOf(StaffSessionUnauthorizedError)
  })

  it('maps 403 to StaffSessionForbiddenError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden', code: 'staff_group_required' }),
    })

    await expect(fetchStaffCatalogEpisode('no-group', 'ep-1')).rejects.toBeInstanceOf(
      StaffSessionForbiddenError,
    )
  })
})
