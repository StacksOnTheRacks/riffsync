// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FanAuthError, FAN_USERNAME_EXISTS_ERROR } from '../../auth/fanSrpAuth'
import { FanSignUpPage } from './FanSignUpPage'

const signUpFan = vi.fn()
const resendFanConfirmationCode = vi.fn()

vi.mock('../../auth/fanSrpAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/fanSrpAuth')>()
  return {
    ...actual,
    signUpFan: (...args: unknown[]) => signUpFan(...args),
    resendFanConfirmationCode: (...args: unknown[]) => resendFanConfirmationCode(...args),
  }
})

vi.mock('../../auth/fanTokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/fanTokens')>()
  return {
    ...actual,
    setFanTokenBundle: vi.fn(),
  }
})

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function renderPage(initialEntry = '/auth/sign-up') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/auth/sign-up" element={<FanSignUpPage />} />
          <Route path="/auth/verify-email" element={<div data-testid="verify-page" />} />
          <Route path="/auth/sign-in" element={<div data-testid="sign-in-page" />} />
        </Routes>
      </MemoryRouter>,
    )
  })

  return { container, root }
}

describe('FanSignUpPage', () => {
  let roots: Root[] = []

  beforeEach(() => {
    signUpFan.mockReset()
    resendFanConfirmationCode.mockReset()
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

  it('calls signUp and navigates to verify-email without writing tokens', async () => {
    signUpFan.mockResolvedValue(undefined)
    const { setFanTokenBundle } = await import('../../auth/fanTokens')

    const { container, root } = renderPage('/auth/sign-up?returnTo=/account')
    roots.push(root)

    setInputValue(container.querySelector('input[name="email"]') as HTMLInputElement, 'fan@example.com')
    setInputValue(container.querySelector('input[name="password"]') as HTMLInputElement, 'NewPass1!')
    setInputValue(container.querySelector('input[name="confirmPassword"]') as HTMLInputElement, 'NewPass1!')

    act(() => {
      ;(container.querySelector('[data-testid="fan-sign-up-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="verify-page"]')).not.toBeNull()
    })

    expect(signUpFan).toHaveBeenCalledWith('fan@example.com', 'NewPass1!')
    expect(setFanTokenBundle).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('riffsync.fanVerifyUsername')).toBe('fan@example.com')
  })

  it('does not render marketing or terms checkbox', () => {
    const { container, root } = renderPage()
    roots.push(root)

    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    expect(container.textContent).not.toMatch(/marketing|terms/i)
  })

  it('shows recoverable error for UsernameExists without verify guidance or auto-resend', async () => {
    signUpFan.mockRejectedValue(new FanAuthError('USERNAME_EXISTS', FAN_USERNAME_EXISTS_ERROR))

    const { container, root } = renderPage()
    roots.push(root)

    setInputValue(container.querySelector('input[name="email"]') as HTMLInputElement, 'fan@example.com')
    setInputValue(container.querySelector('input[name="password"]') as HTMLInputElement, 'NewPass1!')
    setInputValue(container.querySelector('input[name="confirmPassword"]') as HTMLInputElement, 'NewPass1!')

    act(() => {
      ;(container.querySelector('[data-testid="fan-sign-up-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="fan-auth-error"]')).not.toBeNull()
    })

    expect(container.textContent).not.toMatch(/check your email|verification code was sent|new account was created/i)
    expect(resendFanConfirmationCode).not.toHaveBeenCalled()
    expect(container.querySelector('a[href*="sign-in"]')).not.toBeNull()
    expect(container.querySelector('a[href*="verify-email"]')).not.toBeNull()
  })
})
