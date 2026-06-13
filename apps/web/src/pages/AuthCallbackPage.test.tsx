// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthCallbackPage } from './AuthCallbackPage'

const completeFanAuthCallback = vi.fn()

vi.mock('../auth/fanHostedUiPkce', () => ({
  completeFanAuthCallback: (...args: unknown[]) => completeFanAuthCallback(...args),
}))

describe('AuthCallbackPage', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
    completeFanAuthCallback.mockReset()
  })

  it('accepts authorization code without state for password reset', async () => {
    completeFanAuthCallback.mockResolvedValue({ nextPath: '/account?passwordReset=1' })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <MemoryRouter initialEntries={['/auth/callback?code=abc123']}>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/account" element={<p>Account landing</p>} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await vi.waitFor(() => {
      expect(completeFanAuthCallback).toHaveBeenCalledWith('abc123', null)
    })
    await vi.waitFor(() => {
      expect(container.textContent).toContain('Account landing')
    })
    expect(container.textContent).not.toContain('Missing OAuth code or state')
  })
})
