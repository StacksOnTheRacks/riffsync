import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchStaffSession,
  StaffSessionForbiddenError,
  StaffSessionUnauthorizedError,
} from './staffAdminSessionApi'

vi.mock('../config/apiBaseUrl', () => ({
  getPublicApiBaseUrl: () => 'https://api.example.test',
}))

describe('fetchStaffSession', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses 200 session payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sub: 'staff-1',
        email: 'op@example.com',
        groups: ['admin'],
      }),
    })

    const session = await fetchStaffSession('staff-token')

    expect(session.sub).toBe('staff-1')
    expect(session.email).toBe('op@example.com')
    expect(session.groups).toEqual(['admin'])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.test/v1/admin/session')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer staff-token',
      Accept: 'application/json',
    })
  })

  it('maps 401 to StaffSessionUnauthorizedError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '',
    })

    await expect(fetchStaffSession('bad')).rejects.toBeInstanceOf(StaffSessionUnauthorizedError)
  })

  it('maps 403 staff_group_required to StaffSessionForbiddenError', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden', code: 'staff_group_required' }),
    })

    await expect(fetchStaffSession('no-group')).rejects.toBeInstanceOf(StaffSessionForbiddenError)
  })
})
