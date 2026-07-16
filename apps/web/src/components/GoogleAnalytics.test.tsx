// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleAnalytics } from './GoogleAnalytics'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../config/googleAnalytics', () => ({
  initGoogleAnalytics: vi.fn(() => Promise.resolve()),
  trackGaPageView: vi.fn(),
}))

import { initGoogleAnalytics, trackGaPageView } from '../config/googleAnalytics'

function NavigateToLobby() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/lobby')}>
      Go to lobby
    </button>
  )
}

describe('GoogleAnalytics', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.clearAllMocks()
  })

  it('tracks the active route on mount and after client navigation', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/catalog']}>
          <GoogleAnalytics />
          <Routes>
            <Route
              path="/catalog"
              element={
                <>
                  <div>Catalog</div>
                  <NavigateToLobby />
                </>
              }
            />
            <Route path="/lobby" element={<div>Lobby</div>} />
          </Routes>
        </MemoryRouter>,
      )
      await Promise.resolve()
    })

    expect(initGoogleAnalytics).toHaveBeenCalled()
    expect(trackGaPageView).toHaveBeenCalledWith('/catalog')

    const button = container.querySelector('button')
    expect(button).not.toBeNull()

    await act(async () => {
      button!.click()
      await Promise.resolve()
    })

    expect(trackGaPageView).toHaveBeenLastCalledWith('/lobby')
  })
})
