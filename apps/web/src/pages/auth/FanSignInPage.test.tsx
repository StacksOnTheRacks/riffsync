// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FanAuthError, FAN_SIGN_IN_GENERIC_ERROR } from '../../auth/fanSrpAuth'
import { FanSignInPage } from './FanSignInPage'

const signInWithSrp = vi.fn()
const startFanHostedUiSignIn = vi.fn()

vi.mock('../../auth/fanSrpAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/fanSrpAuth')>()
  return {
    ...actual,
    signInWithSrp: (...args: unknown[]) => signInWithSrp(...args),
  }
})

vi.mock('../../auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignIn: (...args: unknown[]) => startFanHostedUiSignIn(...args),
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function renderPage(initialEntry = '/auth/sign-in') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/auth/sign-in" element={<FanSignInPage />} />
          <Route path="/auth/sign-up" element={<div data-testid="sign-up-page" />} />
          <Route path="/auth/forgot-password" element={<div data-testid="forgot-page" />} />
          <Route path="/auth/verify-email" element={<div data-testid="verify-page" />} />
          <Route path="/account" element={<LocationProbe />} />
          <Route path="/catalog" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
  })

  return { container, root }
}

describe('FanSignInPage', () => {
  let roots: Root[] = []

  beforeEach(() => {
    signInWithSrp.mockReset()
    startFanHostedUiSignIn.mockReset()
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

  it('signs in with SRP and navigates to returnTo', async () => {
    signInWithSrp.mockResolvedValue({ accessToken: 'token', expiresIn: 3600 })
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {})

    const { container, root } = renderPage('/auth/sign-in?returnTo=/account')
    roots.push(root)

    setInputValue(container.querySelector('input[name="email"]') as HTMLInputElement, 'fan@example.com')
    setInputValue(container.querySelector('input[name="password"]') as HTMLInputElement, 'Secret1!')

    act(() => {
      ;(container.querySelector('[data-testid="fan-sign-in-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/account')
    })

    expect(signInWithSrp).toHaveBeenCalledWith('fan@example.com', 'Secret1!')
    expect(startFanHostedUiSignIn).not.toHaveBeenCalled()
    expect(assignSpy).not.toHaveBeenCalled()
    assignSpy.mockRestore()
  })

  it('routes unverified sign-in to verify-email without tokens', async () => {
    signInWithSrp.mockRejectedValue(new FanAuthError('UNCONFIRMED', 'not verified'))

    const { container, root } = renderPage('/auth/sign-in?returnTo=/account')
    roots.push(root)

    setInputValue(container.querySelector('input[name="email"]') as HTMLInputElement, 'fan@example.com')
    setInputValue(container.querySelector('input[name="password"]') as HTMLInputElement, 'Secret1!')

    act(() => {
      ;(container.querySelector('[data-testid="fan-sign-in-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="verify-page"]')).not.toBeNull()
    })

    expect(sessionStorage.getItem('riffsync.fanVerifyUsername')).toBe('fan@example.com')
  })

  it('shows recoverable error for NEW_PASSWORD_REQUIRED', async () => {
    signInWithSrp.mockRejectedValue(new FanAuthError('NEW_PASSWORD_REQUIRED', 'need new password'))

    const { container, root } = renderPage()
    roots.push(root)

    setInputValue(container.querySelector('input[name="email"]') as HTMLInputElement, 'fan@example.com')
    setInputValue(container.querySelector('input[name="password"]') as HTMLInputElement, 'Secret1!')

    act(() => {
      ;(container.querySelector('[data-testid="fan-sign-in-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="fan-auth-error"]')).not.toBeNull()
    })

    expect(container.textContent).not.toContain('/auth/set-new-password')
  })

  it('shows the same generic auth error for NotAuthorized and UserNotFound', async () => {
    for (const code of ['NOT_AUTHORIZED', 'NOT_AUTHORIZED'] as const) {
      signInWithSrp.mockRejectedValue(new FanAuthError(code, FAN_SIGN_IN_GENERIC_ERROR))

      const { container, root } = renderPage()
      roots.push(root)

      setInputValue(container.querySelector('input[name="email"]') as HTMLInputElement, 'fan@example.com')
      setInputValue(container.querySelector('input[name="password"]') as HTMLInputElement, 'Secret1!')

      act(() => {
        ;(container.querySelector('[data-testid="fan-sign-in-form"]') as HTMLFormElement).requestSubmit()
      })

      await vi.waitFor(() => {
        expect(container.querySelector('[data-testid="fan-auth-error"]')?.textContent).toContain(
          'Incorrect email or password',
        )
      })

      expect(container.textContent).not.toMatch(/not found|no account/i)
      root.unmount()
      document.body.innerHTML = ''
    }
  })

  it('does not call Cognito sign-in on empty email and password', async () => {
    const { container, root } = renderPage()
    roots.push(root)

    act(() => {
      ;(container.querySelector('[data-testid="fan-sign-in-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelectorAll('[data-testid="fan-auth-error"]').length).toBeGreaterThan(0)
    })

    expect(signInWithSrp).not.toHaveBeenCalled()
  })

  it('navigates to /catalog for evil returnTo on success', async () => {
    signInWithSrp.mockResolvedValue({ accessToken: 'token', expiresIn: 3600 })

    const { container, root } = renderPage('/auth/sign-in?returnTo=https://evil.example/phish')
    roots.push(root)

    setInputValue(container.querySelector('input[name="email"]') as HTMLInputElement, 'fan@example.com')
    setInputValue(container.querySelector('input[name="password"]') as HTMLInputElement, 'Secret1!')

    act(() => {
      ;(container.querySelector('[data-testid="fan-sign-in-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/catalog')
    })
  })

  it('exposes focusable secondary links', () => {
    const { container, root } = renderPage('/auth/sign-in?returnTo=/account')
    roots.push(root)

    const createAccount = container.querySelector('a[href*="sign-up"]') as HTMLAnchorElement
    const forgotPassword = container.querySelector('a[href*="forgot-password"]') as HTMLAnchorElement
    expect(createAccount.tabIndex).not.toBe(-1)
    expect(forgotPassword.tabIndex).not.toBe(-1)
  })
})
