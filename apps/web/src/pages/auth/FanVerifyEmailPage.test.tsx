// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FanVerifyEmailPage } from './FanVerifyEmailPage'

const confirmFanSignUp = vi.fn()
const resendFanConfirmationCode = vi.fn()
const getFanAccessToken = vi.fn()

vi.mock('../../auth/fanSrpAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/fanSrpAuth')>()
  return {
    ...actual,
    confirmFanSignUp: (...args: unknown[]) => confirmFanSignUp(...args),
    resendFanConfirmationCode: (...args: unknown[]) => resendFanConfirmationCode(...args),
  }
})

vi.mock('../../auth/fanTokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/fanTokens')>()
  return {
    ...actual,
    getFanAccessToken: () => getFanAccessToken(),
    setFanTokenBundle: vi.fn(),
  }
})

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function setInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function renderPage(initialEntry = '/auth/verify-email') {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/auth/verify-email" element={<FanVerifyEmailPage />} />
          <Route path="/auth/sign-in" element={<LocationProbe />} />
          <Route path="/account" element={<LocationProbe />} />
          <Route path="/catalog" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
  })

  return { container, root }
}

describe('FanVerifyEmailPage', () => {
  let roots: Root[] = []

  beforeEach(() => {
    confirmFanSignUp.mockReset()
    resendFanConfirmationCode.mockReset()
    getFanAccessToken.mockReturnValue(null)
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

  it('confirms typed code and navigates to sign-in with returnTo', async () => {
    sessionStorage.setItem('riffsync.fanVerifyUsername', 'fan@example.com')
    confirmFanSignUp.mockResolvedValue(undefined)

    const { container, root } = renderPage('/auth/verify-email?returnTo=/account')
    roots.push(root)

    setInputValue(container.querySelector('input[name="code"]') as HTMLInputElement, '123456')

    act(() => {
      ;(container.querySelector('[data-testid="fan-verify-email-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="location"]')?.textContent).toContain('/auth/sign-in')
      expect(container.querySelector('[data-testid="location"]')?.textContent).toContain('returnTo=%2Faccount')
    })

    expect(confirmFanSignUp).toHaveBeenCalledWith('fan@example.com', '123456')
    const { setFanTokenBundle } = await import('../../auth/fanTokens')
    expect(setFanTokenBundle).not.toHaveBeenCalled()
  })

  it('navigates to returnTo when a session already exists', async () => {
    sessionStorage.setItem('riffsync.fanVerifyUsername', 'fan@example.com')
    getFanAccessToken.mockReturnValue('existing-token')
    confirmFanSignUp.mockResolvedValue(undefined)

    const { container, root } = renderPage('/auth/verify-email?returnTo=/account')
    roots.push(root)

    setInputValue(container.querySelector('input[name="code"]') as HTMLInputElement, '123456')

    act(() => {
      ;(container.querySelector('[data-testid="fan-verify-email-form"]') as HTMLFormElement).requestSubmit()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/account')
    })
  })

  it('strips confirmation_code from the URL after render while keeping returnTo and prefilled code', async () => {
    sessionStorage.setItem('riffsync.fanVerifyUsername', 'fan@example.com')
    const replaceSpy = vi.spyOn(window.history, 'replaceState')

    const { container, root } = renderPage('/auth/verify-email?confirmation_code=secret-code&returnTo=/account')
    roots.push(root)

    await vi.waitFor(() => {
      expect(replaceSpy).toHaveBeenCalled()
    })

    expect(window.location.search).not.toContain('confirmation_code')
    expect(window.location.search).toContain('returnTo=%2Faccount')
    expect((container.querySelector('input[name="code"]') as HTMLInputElement).value).toBe('secret-code')
  })

  it('strips code param twin from the URL after render', async () => {
    sessionStorage.setItem('riffsync.fanVerifyUsername', 'fan@example.com')
    const replaceSpy = vi.spyOn(window.history, 'replaceState')

    const { container, root } = renderPage('/auth/verify-email?code=secret-code&returnTo=/account')
    roots.push(root)

    await vi.waitFor(() => {
      expect(replaceSpy).toHaveBeenCalled()
    })

    expect(window.location.search).not.toContain('code=')
    expect((container.querySelector('input[name="code"]') as HTMLInputElement).value).toBe('secret-code')
  })

  it('shows recoverable error when email is missing and does not call confirm', () => {
    const { container, root } = renderPage('/auth/verify-email')
    roots.push(root)

    expect(container.querySelector('[data-testid="fan-auth-error"]')).not.toBeNull()
    expect(container.querySelector('input[name="code"]')).toBeNull()
    expect(confirmFanSignUp).not.toHaveBeenCalled()
    expect(container.querySelector('a[href*="sign-in"]')).not.toBeNull()
    expect(container.querySelector('a[href*="sign-up"]')).not.toBeNull()
  })

  it('resends confirmation code and announces success', async () => {
    sessionStorage.setItem('riffsync.fanVerifyUsername', 'fan@example.com')
    resendFanConfirmationCode.mockResolvedValue(undefined)

    const { container, root } = renderPage('/auth/verify-email?returnTo=/account')
    roots.push(root)

    act(() => {
      ;(container.querySelector('.riffsync-fan-auth__secondary-action') as HTMLButtonElement).click()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="fan-verify-email-resend-sent"]')).not.toBeNull()
    })

    expect(resendFanConfirmationCode).toHaveBeenCalledWith('fan@example.com')
    expect(container.querySelector('[data-testid="verify-page"]')).toBeNull()
  })

  it('exposes focusable resend and back links', () => {
    sessionStorage.setItem('riffsync.fanVerifyUsername', 'fan@example.com')

    const { container, root } = renderPage('/auth/verify-email?returnTo=/account')
    roots.push(root)

    const resend = container.querySelector('.riffsync-fan-auth__secondary-action') as HTMLButtonElement
    const backLink = container.querySelector('a[href*="sign-in"]') as HTMLAnchorElement
    expect(resend.tabIndex).not.toBe(-1)
    expect(backLink.tabIndex).not.toBe(-1)
  })
})
