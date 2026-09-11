// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FanResetPasswordPage } from './FanResetPasswordPage'
import { setFanTokenBundle } from '../../auth/fanTokens'

const confirmFanPasswordReset = vi.fn()

vi.mock('../../auth/fanSrpAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/fanSrpAuth')>()
  return {
    ...actual,
    confirmFanPasswordReset: (...args: unknown[]) => confirmFanPasswordReset(...args),
  }
})

vi.mock('../../auth/fanTokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/fanTokens')>()
  return {
    ...actual,
    setFanTokenBundle: vi.fn(actual.setFanTokenBundle),
  }
})

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
}

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function renderPage(initialEntry: string) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/auth/reset-password"
            element={
              <>
                <FanResetPasswordPage />
                <LocationProbe />
              </>
            }
          />
          <Route path="/auth/sign-in" element={<div data-testid="sign-in-page" />} />
        </Routes>
      </MemoryRouter>,
    )
  })

  return { container, root }
}

describe('FanResetPasswordPage', () => {
  let roots: Root[] = []

  beforeEach(() => {
    confirmFanPasswordReset.mockReset()
    vi.mocked(setFanTokenBundle).mockClear()
    sessionStorage.clear()
    window.history.replaceState(null, '', '/')
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

  it('strips confirmation_code from the URL and keeps prefilled code', async () => {
    window.history.replaceState(null, '', '/auth/reset-password?confirmation_code=secret-code&returnTo=/account')
    const replaceSpy = vi.spyOn(window.history, 'replaceState')

    const { container, root } = renderPage('/auth/reset-password?confirmation_code=secret-code&returnTo=/account')
    roots.push(root)

    await vi.waitFor(() => {
      expect(replaceSpy).toHaveBeenCalled()
    })

    expect(window.location.search).not.toContain('confirmation_code')
    expect(window.location.search).toContain('returnTo=%2Faccount')

    const codeInput = container.querySelector('input[name="code"]') as HTMLInputElement
    expect(codeInput.value).toBe('secret-code')
  })

  it('strips code param variant from the URL', async () => {
    window.history.replaceState(null, '', '/auth/reset-password?code=secret-code&returnTo=/account')

    const { container, root } = renderPage('/auth/reset-password?code=secret-code&returnTo=/account')
    roots.push(root)

    await vi.waitFor(() => {
      expect(window.location.search).not.toContain('code=secret')
    })

    const codeInput = container.querySelector('input[name="code"]') as HTMLInputElement
    expect(codeInput.value).toBe('secret-code')
  })

  it('submits typed code and navigates to sign-in without writing tokens', async () => {
    confirmFanPasswordReset.mockResolvedValue(undefined)

    const { container, root } = renderPage('/auth/reset-password?returnTo=/account')
    roots.push(root)

    const setField = (name: string, value: string) => {
      setInputValue(container.querySelector(`input[name="${name}"]`) as HTMLInputElement, value)
    }

    setField('email', 'fan@example.com')
    setField('code', '123456')
    setField('newPassword', 'NewPass1!')
    setField('confirmPassword', 'NewPass1!')

    act(() => {
      ;(container.querySelector('[data-testid="fan-reset-password-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(confirmFanPasswordReset).toHaveBeenCalledWith({
        username: 'fan@example.com',
        confirmationCode: '123456',
        newPassword: 'NewPass1!',
      })
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="sign-in-page"]')).not.toBeNull()
    })

    expect(setFanTokenBundle).not.toHaveBeenCalled()
  })

  it('shows field error on confirm password mismatch without calling Cognito', async () => {
    const { container, root } = renderPage('/auth/reset-password')
    roots.push(root)

    const setField = (name: string, value: string) => {
      setInputValue(container.querySelector(`input[name="${name}"]`) as HTMLInputElement, value)
    }

    setField('email', 'fan@example.com')
    setField('code', '123456')
    setField('newPassword', 'NewPass1!')
    setField('confirmPassword', 'Mismatch1!')

    act(() => {
      ;(container.querySelector('[data-testid="fan-reset-password-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="fan-auth-error"]')).not.toBeNull()
    })

    expect(confirmFanPasswordReset).not.toHaveBeenCalled()
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows recoverable form error for expired code', async () => {
    const { FanAuthError } = await import('../../auth/fanSrpAuth')
    confirmFanPasswordReset.mockRejectedValue(new FanAuthError('EXPIRED_CODE', 'The reset code has expired.'))

    const { container, root } = renderPage('/auth/reset-password')
    roots.push(root)

    const setField = (name: string, value: string) => {
      setInputValue(container.querySelector(`input[name="${name}"]`) as HTMLInputElement, value)
    }

    setField('email', 'fan@example.com')
    setField('code', '123456')
    setField('newPassword', 'NewPass1!')
    setField('confirmPassword', 'NewPass1!')

    act(() => {
      ;(container.querySelector('[data-testid="fan-reset-password-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="fan-auth-error"]')).not.toBeNull()
    })

    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false)
  })
})
