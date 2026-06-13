// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './AppRoutes'

vi.mock('./auth/FanSessionKeepAlive', () => ({
  FanSessionKeepAlive: () => null,
}))

vi.mock('./auth/useFanSession', () => ({
  useFanSession: () => ({ fanToken: 'fan-token' }),
}))

vi.mock('./pages/AccountPage', () => ({
  AccountPage: () => <p>RiffSync Account Settings</p>,
}))

vi.mock('./room/RoomChromeProvider', () => ({
  RoomChromeProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('./room/useRoomChrome', () => ({
  useRoomChromeOptional: () => null,
}))

describe('AppRoutes fan account route', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
  })

  it('renders AccountPage under fan site shell', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <MemoryRouter initialEntries={['/account']}>
          <AppRoutes />
        </MemoryRouter>,
      )
    })

    await vi.waitFor(() => {
      expect(container.textContent).toContain('RiffSync Account Settings')
    })

    expect(container.querySelector('#gen-header')).not.toBeNull()
    expect(container.querySelector('a[href="/account"]')).not.toBeNull()
  })
})
