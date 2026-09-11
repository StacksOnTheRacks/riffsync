// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './AppRoutes'

describe('AppRoutes fan auth shells', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
  })

  it.each([
    ['/auth/sign-in', 'Sign in'],
    ['/auth/sign-up', 'Create account'],
    ['/auth/verify-email', 'Verify email'],
    ['/auth/forgot-password', 'Forgot password'],
    ['/auth/reset-password', 'Reset password'],
    ['/auth/change-password', 'Change password'],
  ])('route %s renders FanAuthLayout with h1 %s', async (path, heading) => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>,
      )
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="fan-auth-layout"]')).not.toBeNull()
    })

    expect(container.querySelector('[data-testid="fan-auth-card"]')).not.toBeNull()
    expect(container.querySelector('h1')?.textContent).toBe(heading)
    expect(container.querySelector('.riffsync-app-shell')).toBeNull()
  })

  it('/auth/callback does not render FanAuthLayout', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <MemoryRouter initialEntries={['/auth/callback']}>
          <AppRoutes />
        </MemoryRouter>,
      )
    })

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Missing OAuth code')
    })

    expect(container.querySelector('[data-testid="fan-auth-layout"]')).toBeNull()
  })
})
