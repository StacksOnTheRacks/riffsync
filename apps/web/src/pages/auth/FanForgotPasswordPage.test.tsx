// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FanForgotPasswordPage } from './FanForgotPasswordPage'

const requestFanPasswordReset = vi.fn()
const startFanHostedUiForgotPassword = vi.fn()

vi.mock('../../auth/fanSrpAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/fanSrpAuth')>()
  return {
    ...actual,
    requestFanPasswordReset: (...args: unknown[]) => requestFanPasswordReset(...args),
  }
})

vi.mock('../../auth/fanHostedUiPkce', () => ({
  startFanHostedUiForgotPassword: (...args: unknown[]) => startFanHostedUiForgotPassword(...args),
}))

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function renderPage(initialEntry = '/auth/forgot-password') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/auth/forgot-password" element={<FanForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<div data-testid="reset-page" />} />
          <Route path="/auth/sign-in" element={<div data-testid="sign-in-page" />} />
        </Routes>
      </MemoryRouter>,
    )
  })

  return { container, root }
}

describe('FanForgotPasswordPage', () => {
  let roots: Root[] = []

  beforeEach(() => {
    requestFanPasswordReset.mockReset()
    startFanHostedUiForgotPassword.mockReset()
    sessionStorage.clear()
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_TestPool')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'fan-client-id')
    vi.stubEnv('VITE_COGNITO_REGION', 'us-east-1')
  })

  afterEach(() => {
    for (const root of roots) root.unmount()
    roots = []
    document.body.innerHTML = ''
    vi.unstubAllEnvs()
  })

  it('shows success after mocked forgot password resolves', async () => {
    requestFanPasswordReset.mockResolvedValue(undefined)
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {})

    const { container, root } = renderPage()
    roots.push(root)

    setInputValue(container.querySelector('input[name="email"]') as HTMLInputElement, 'fan@example.com')

    const form = container.querySelector('[data-testid="fan-forgot-password-form"]') as HTMLFormElement
    act(() => {
      form.requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="fan-forgot-password-success"]')).not.toBeNull()
    })

    expect(requestFanPasswordReset).toHaveBeenCalledWith('fan@example.com')
    expect(startFanHostedUiForgotPassword).not.toHaveBeenCalled()
    expect(assignSpy).not.toHaveBeenCalled()
    assignSpy.mockRestore()
  })

  it('shows the same success for UserNotFound-style facade resolve', async () => {
    requestFanPasswordReset.mockResolvedValue(undefined)

    const { container, root } = renderPage()
    roots.push(root)

    setInputValue(container.querySelector('input[name="email"]') as HTMLInputElement, 'unknown@example.com')

    act(() => {
      ;(container.querySelector('[data-testid="fan-forgot-password-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="fan-forgot-password-success"]')).not.toBeNull()
    })

    const success = container.querySelector('[data-testid="fan-forgot-password-success"]')
    expect(success?.textContent).not.toMatch(/not found|no account|failed/i)
  })

  it('does not call Cognito forgot on empty email', async () => {
    const { container, root } = renderPage()
    roots.push(root)

    act(() => {
      ;(container.querySelector('[data-testid="fan-forgot-password-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="fan-auth-error"]')).not.toBeNull()
    })

    expect(requestFanPasswordReset).not.toHaveBeenCalled()
  })

  it('links to reset-password with preserved returnTo', async () => {
    requestFanPasswordReset.mockResolvedValue(undefined)

    const { container, root } = renderPage('/auth/forgot-password?returnTo=/account')
    roots.push(root)

    setInputValue(container.querySelector('input[name="email"]') as HTMLInputElement, 'fan@example.com')

    act(() => {
      ;(container.querySelector('[data-testid="fan-forgot-password-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="fan-forgot-password-success"]')).not.toBeNull()
    })

    const resetLink = container.querySelector('a.riffsync-fan-auth__primary-link') as HTMLAnchorElement
    expect(resetLink.getAttribute('href')).toContain('/auth/reset-password')
    expect(resetLink.getAttribute('href')).toContain('returnTo=%2Faccount')
    expect(resetLink.tabIndex).not.toBe(-1)
  })
})
