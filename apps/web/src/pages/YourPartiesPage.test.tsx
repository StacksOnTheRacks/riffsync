// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YourPartiesPage } from './YourPartiesPage'

const startFanHostedUiSignIn = vi.fn<(returnPath: string) => Promise<void>>()
const useFanSession = vi.fn()

vi.mock('../auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignIn: (returnPath: string) => startFanHostedUiSignIn(returnPath),
}))

vi.mock('../auth/useFanSession', () => ({
  useFanSession: () => useFanSession(),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('YourPartiesPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    startFanHostedUiSignIn.mockReset()
    startFanHostedUiSignIn.mockResolvedValue(undefined)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('starts sign in when signed out', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    act(() => {
      root.render(
        <MemoryRouter>
          <YourPartiesPage />
        </MemoryRouter>,
      )
    })

    expect(startFanHostedUiSignIn).toHaveBeenCalledWith('/your-parties')
  })

  it('renders placeholder when signed in', () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    act(() => {
      root.render(
        <MemoryRouter>
          <YourPartiesPage />
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('coming soon')
    expect(startFanHostedUiSignIn).not.toHaveBeenCalled()
  })
})
