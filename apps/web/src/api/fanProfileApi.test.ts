import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FAN_AVATAR_MAX_BYTES,
  uploadFanProfileAvatar,
  validateFanAvatarFile,
} from './fanProfileApi'

vi.mock('../config/apiBaseUrl', () => ({
  getPublicApiBaseUrl: () => 'https://api.example.test',
}))

describe('validateFanAvatarFile', () => {
  it('accepts allowed image types within size limit', () => {
    const file = new File([new Uint8Array(100)], 'a.png', { type: 'image/png' })
    expect(validateFanAvatarFile(file)).toBeNull()
  })

  it('rejects disallowed mime types without network', () => {
    const file = new File([new Uint8Array(100)], 'a.gif', { type: 'image/gif' })
    expect(validateFanAvatarFile(file)).toMatch(/JPEG, PNG, or WebP/i)
  })

  it('rejects files larger than 2 MiB without network', () => {
    const file = new File([new Uint8Array(FAN_AVATAR_MAX_BYTES + 1)], 'big.png', {
      type: 'image/png',
    })
    expect(validateFanAvatarFile(file)).toMatch(/2 MB/i)
  })
})

describe('uploadFanProfileAvatar', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts multipart file on happy path', async () => {
    const bytes = new Uint8Array(8)
    const file = new File([bytes], 'avatar.png', { type: 'image/png' })
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        avatarUrl: 'https://cdn.example.test/avatars/sub/avatar.png',
        avatarUpdatedAt: 1_700_000_000_000,
      }),
    })

    const result = await uploadFanProfileAvatar('token-abc', file)

    expect(result.avatarUrl).toContain('avatar.png')
    expect(result.avatarUpdatedAt).toBe(1_700_000_000_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.test/v1/fans/me/avatar')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token-abc',
      Accept: 'application/json',
    })
    const body = init.body as FormData
    expect(body.get('file')).toBe(file)
  })

  it('surfaces 401 from the API', async () => {
    const file = new File([new Uint8Array(8)], 'avatar.png', { type: 'image/png' })
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '',
    })

    await expect(uploadFanProfileAvatar('bad-token', file)).rejects.toThrow(/Sign in again/i)
  })

  it('does not call fetch when client validation fails', async () => {
    const file = new File([new Uint8Array(FAN_AVATAR_MAX_BYTES + 1)], 'big.png', {
      type: 'image/png',
    })

    await expect(uploadFanProfileAvatar('token-abc', file)).rejects.toThrow(/2 MB/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
