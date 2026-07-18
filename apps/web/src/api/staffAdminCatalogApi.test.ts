import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createStaffCatalogEpisode,
  deleteStaffCatalogEpisode,
  fetchStaffCatalogEpisode,
  fetchStaffCatalogList,
  patchStaffCatalogEpisode,
  StaffCatalogEpisodeInUseError,
  StaffCatalogValidationError,
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

  it('createStaffCatalogEpisode POSTs writable body to episode path', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ entry: { id: 'new-ep' } }),
    })

    const body = {
      experimentNumber: 1,
      title: 'New',
      catalog: 'other' as const,
      tags: [],
      labels: [],
      youtubeVideoId: null,
      youtubeWatchUrl: null,
    }
    await createStaffCatalogEpisode('staff-token', 'new-ep', body)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.test/v1/admin/catalog/episodes/new-ep')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer staff-token',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init.body))).toEqual(body)
  })

  it('patchStaffCatalogEpisode PATCHes partial body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entry: { id: 'ep-1', title: 'Updated' } }),
    })

    await patchStaffCatalogEpisode('staff-token', 'ep-1', { title: 'Updated' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.test/v1/admin/catalog/episodes/ep-1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toEqual({ title: 'Updated' })
  })

  it('maps 400 validation_error to StaffCatalogValidationError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        code: 'validation_error',
        details: [{ instancePath: '/title' }],
      }),
    })

    await expect(
      patchStaffCatalogEpisode('staff-token', 'ep-1', { title: '' }),
    ).rejects.toBeInstanceOf(StaffCatalogValidationError)
  })

  it('deleteStaffCatalogEpisode sends DELETE and resolves on 204', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    })

    await deleteStaffCatalogEpisode('staff-token', 'ep-1')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.test/v1/admin/catalog/episodes/ep-1')
    expect(init.method).toBe('DELETE')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer staff-token',
      Accept: 'application/json',
    })
  })

  it('deleteStaffCatalogEpisode maps 409 catalog_episode_in_use', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'Conflict',
        code: 'catalog_episode_in_use',
        references: { rooms: 3, lists: 1 },
      }),
    })

    await expect(deleteStaffCatalogEpisode('staff-token', 'ep-1')).rejects.toMatchObject({
      references: { rooms: 3, lists: 1 },
    })
    await expect(deleteStaffCatalogEpisode('staff-token', 'ep-1')).rejects.toBeInstanceOf(
      StaffCatalogEpisodeInUseError,
    )
  })
})
