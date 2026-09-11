// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FanAuthError } from '../../auth/fanSrpAuth'
import { FanChangePasswordPage } from './FanChangePasswordPage'

const changePassword = vi.fn()
const getFanAccessToken = vi.fn<() => string | null>()
const startFanHostedUiSignIn = vi.fn()

vi.mock('../../auth/fanSrpAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/fanSrpAuth')>()
  return {
    ...actual,
    changePassword: (...args: unknown[]) => changePassword(...args),
  }
})

vi.mock('../../auth/fanTokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/fanTokens')>()
  return {
    ...actual,
    getFanAccessToken: () => getFanAccessToken(),
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

function renderPage(initialEntry = '/auth/change-password') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/auth/change-password" element={<FanChangePasswordPage />} />
          <Route path="/auth/sign-in" element={<LocationProbe />} />
          <Route path="/account" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
  })

  return { container, root }
}

describe('FanChangePasswordPage', () => {
  let roots: Root[] = []

  beforeEach(() => {
    changePassword.mockReset()
    getFanAccessToken.mockReset()
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

  it('renders change-password chrome when authenticated', () => {
    getFanAccessToken.mockReturnValue('fan-token')
    const { container, root } = renderPage()
    roots.push(root)

    expect(container.querySelector('[data-testid="fan-change-password-form"]')).not.toBeNull()
    expect(container.querySelector('h1')?.textContent).toBe('Change Password')
    expect(container.textContent).toContain('Update your password while signed in.')
    expect(container.querySelector('input[name="currentPassword"]')).not.toBeNull()
    expect(container.querySelector('input[name="newPassword"]')).not.toBeNull()
    expect(container.querySelector('input[name="confirmPassword"]')).not.toBeNull()
    expect(container.querySelector('button[type="submit"]')?.textContent).toBe('Update password')
    expect(container.querySelector('a[href="/account"]')?.textContent).toBe('Back to account')
  })

  it('redirects unauthenticated visitors to sign-in with returnTo=/account', async () => {
    getFanAccessToken.mockReturnValue(null)
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {})

    const { container, root } = renderPage()
    roots.push(root)

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
        '/auth/sign-in?returnTo=%2Faccount',
      )
    })

    expect(container.querySelector('[data-testid="fan-change-password-form"]')).toBeNull()
    expect(changePassword).not.toHaveBeenCalled()
    expect(startFanHostedUiSignIn).not.toHaveBeenCalled()
    expect(assignSpy).not.toHaveBeenCalled()
    assignSpy.mockRestore()
  })

  it('changes password and navigates to account success banner', async () => {
    getFanAccessToken.mockReturnValue('fan-token')
    changePassword.mockResolvedValue(undefined)
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {})

    const { container, root } = renderPage()
    roots.push(root)

    setInputValue(container.querySelector('input[name="currentPassword"]') as HTMLInputElement, 'OldPass1!')
    setInputValue(container.querySelector('input[name="newPassword"]') as HTMLInputElement, 'NewPass2!')
    setInputValue(container.querySelector('input[name="confirmPassword"]') as HTMLInputElement, 'NewPass2!')

    act(() => {
      ;(container.querySelector('[data-testid="fan-change-password-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
        '/account?passwordReset=1',
      )
    })

    expect(changePassword).toHaveBeenCalledWith('OldPass1!', 'NewPass2!')
    expect(startFanHostedUiSignIn).not.toHaveBeenCalled()
    expect(assignSpy).not.toHaveBeenCalled()
    assignSpy.mockRestore()
  })

  it('shows field errors for confirm mismatch without calling Cognito', async () => {
    getFanAccessToken.mockReturnValue('fan-token')

    const { container, root } = renderPage()
    roots.push(root)

    setInputValue(container.querySelector('input[name="currentPassword"]') as HTMLInputElement, 'OldPass1!')
    setInputValue(container.querySelector('input[name="newPassword"]') as HTMLInputElement, 'NewPass2!')
    setInputValue(container.querySelector('input[name="confirmPassword"]') as HTMLInputElement, 'Mismatch2!')

    act(() => {
      ;(container.querySelector('[data-testid="fan-change-password-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="fan-auth-error"]')?.textContent).toContain(
        'Passwords do not match',
      )
    })

    expect(changePassword).not.toHaveBeenCalled()
  })

  it('shows recoverable error for wrong current password', async () => {
    getFanAccessToken.mockReturnValue('fan-token')
    changePassword.mockRejectedValue(new FanAuthError('NOT_AUTHORIZED', 'Current password is incorrect.'))

    const { container, root } = renderPage()
    roots.push(root)

    setInputValue(container.querySelector('input[name="currentPassword"]') as HTMLInputElement, 'Wrong1!')
    setInputValue(container.querySelector('input[name="newPassword"]') as HTMLInputElement, 'NewPass2!')
    setInputValue(container.querySelector('input[name="confirmPassword"]') as HTMLInputElement, 'NewPass2!')

    act(() => {
      ;(container.querySelector('[data-testid="fan-change-password-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="fan-auth-error"]')?.textContent).toBe(
        'Current password is incorrect.',
      )
    })

    expect(container.querySelector('[data-testid="location"]')).toBeNull()
  })

  it('exposes aria-busy on submit while in flight', async () => {
    getFanAccessToken.mockReturnValue('fan-token')
    let resolveChange!: () => void
    changePassword.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveChange = resolve
        }),
    )

    const { container, root } = renderPage()
    roots.push(root)

    setInputValue(container.querySelector('input[name="currentPassword"]') as HTMLInputElement, 'OldPass1!')
    setInputValue(container.querySelector('input[name="newPassword"]') as HTMLInputElement, 'NewPass2!')
    setInputValue(container.querySelector('input[name="confirmPassword"]') as HTMLInputElement, 'NewPass2!')

    act(() => {
      ;(container.querySelector('[data-testid="fan-change-password-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('button[type="submit"]')?.getAttribute('aria-busy')).toBe('true')
    })

    await act(async () => {
      resolveChange()
    })
  })
})
