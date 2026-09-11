// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthCallbackPage } from './AuthCallbackPage'

const completeFanAuthCallback = vi.fn()
const navigate = vi.fn()

vi.mock('../auth/fanHostedUiPkce', () => ({
  completeFanAuthCallback: (...args: unknown[]) => completeFanAuthCallback(...args),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

describe('AuthCallbackPage', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    completeFanAuthCallback.mockReset()
    navigate.mockReset()
  })

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
  })

  it('completes PKCE callback and navigates to sanitized return path', async () => {
    completeFanAuthCallback.mockResolvedValue({ nextPath: '/catalog' })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <MemoryRouter initialEntries={['/auth/callback?code=abc&state=xyz']}>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await vi.waitFor(() => {
      expect(completeFanAuthCallback).toHaveBeenCalledWith('abc', 'xyz')
    })

    expect(navigate).toHaveBeenCalledWith('/catalog', { replace: true })
    expect(container.querySelector('[data-testid="fan-auth-layout"]')).toBeNull()
  })
})
