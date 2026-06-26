// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminEmailPage } from './AdminEmailPage'

vi.mock('../../auth/staffHostedUiPkce', () => ({
  refreshStaffTokensIfStale: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../auth/staffTokens', () => ({
  getStaffAccessToken: () => 'staff-token',
}))

vi.mock('../../admin/useAdminSession', () => ({
  useAdminSession: () => ({
    session: { sub: 'staff-1', email: 'admin@example.com', groups: ['admin'] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))

vi.mock('../../api/staffAdminEmailApi', () => ({
  fetchStaffEmailAudience: vi.fn().mockResolvedValue({ eligibleCount: 3 }),
  sendStaffEmailTest: vi.fn(),
  sendStaffEmailBroadcast: vi.fn(),
  StaffSessionUnauthorizedError: class StaffSessionUnauthorizedError extends Error {},
  StaffSessionForbiddenError: class StaffSessionForbiddenError extends Error {},
  StaffEmailValidationError: class StaffEmailValidationError extends Error {},
  StaffEmailConflictError: class StaffEmailConflictError extends Error {},
  StaffEmailDisabledError: class StaffEmailDisabledError extends Error {},
}))

describe('AdminEmailPage', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root?.unmount()
    root = null
    container.remove()
  })

  it('shows audience count and keeps customer send disabled before test', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter>
          <AdminEmailPage />
        </MemoryRouter>,
      )
    })

    expect(document.body.textContent).toContain('Eligible customers: 3')
    const sendButton = Array.from(document.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Send to customers'),
    )
    expect(sendButton).toBeTruthy()
    expect((sendButton as HTMLButtonElement).disabled).toBe(true)
  })
})
