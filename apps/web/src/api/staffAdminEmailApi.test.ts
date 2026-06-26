import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchStaffEmailAudience,
  sendStaffEmailBroadcast,
  sendStaffEmailTest,
  StaffEmailConflictError,
  StaffEmailDisabledError,
} from './staffAdminEmailApi'
import {
  StaffSessionForbiddenError,
  StaffSessionUnauthorizedError,
} from './staffAdminSessionApi'

vi.mock('../config/apiBaseUrl', () => ({
  getPublicApiBaseUrl: () => 'https://api.example.test',
}))

describe('staffAdminEmailApi', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const sampleContent = {
    version: 1 as const,
    blocks: [{ type: 'paragraph' as const, children: [{ type: 'text' as const, text: 'Hello' }] }],
  }

  it('fetchStaffEmailAudience returns count only', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ eligibleCount: 5 }),
    })

    const res = await fetchStaffEmailAudience('token')
    expect(res.eligibleCount).toBe(5)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/v1/admin/email/audience')
  })

  it('maps 403 customer_email_send_disabled', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ code: 'customer_email_send_disabled', error: 'disabled' }),
    })

    await expect(
      sendStaffEmailBroadcast('token', {
        subject: 'Hi',
        content: sampleContent,
        confirmationPhrase: 'SEND TO CUSTOMERS',
        contentHash: 'abc',
        audienceCount: 1,
        testSentAt: new Date().toISOString(),
        testProof: 'proof',
      }),
    ).rejects.toBeInstanceOf(StaffEmailDisabledError)
  })

  it('maps 409 conflicts', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ code: 'test_required', error: 'Send test first' }),
    })

    await expect(
      sendStaffEmailTest('token', { subject: 'Hi', content: sampleContent }),
    ).rejects.toBeInstanceOf(StaffEmailConflictError)
  })

  it('maps 401 unauthorized', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '',
    })

    await expect(fetchStaffEmailAudience('bad')).rejects.toBeInstanceOf(StaffSessionUnauthorizedError)
  })

  it('maps 403 staff_group_required', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ code: 'staff_group_required' }),
    })

    await expect(fetchStaffEmailAudience('no-admin')).rejects.toBeInstanceOf(StaffSessionForbiddenError)
  })
})
