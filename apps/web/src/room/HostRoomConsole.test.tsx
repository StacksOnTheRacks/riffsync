// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HostRoomConsole } from './HostRoomConsole'

vi.mock('../catalog/catalogQueries', () => ({
  useCatalogListQuery: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
}))

const baseProps = {
  extensionPresent: true,
  mediaTabOpen: false,
  mediaPlaybackControllable: false,
  captureActive: false,
  nowPlayingTitle: 'Test Title',
  nextUpItems: [],
  onAddCatalog: vi.fn(),
  onAddUrl: vi.fn(() => true),
  onRemoveNextUp: vi.fn(),
  onOpenLoadMedia: vi.fn(),
  onStartBroadcast: vi.fn(),
  onStopBroadcast: vi.fn(),
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onFastForward: vi.fn(),
}

describe('HostRoomConsole', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.clearAllMocks()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderConsole(overrides: Partial<typeof baseProps> = {}) {
    act(() => {
      root.render(
        <MemoryRouter>
          <HostRoomConsole {...baseProps} {...overrides} />
        </MemoryRouter>,
      )
    })
  }

  it('shows Load Media instead of Open Media Source Tab when media tab is closed', () => {
    renderConsole()
    expect(container.textContent).toContain('Load Media')
    expect(container.textContent).not.toContain('Open Media Source Tab')
  })

  it('calls onOpenLoadMedia when Load Media is clicked', () => {
    const onOpenLoadMedia = vi.fn()
    renderConsole({ onOpenLoadMedia })
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Load Media')
    act(() => btn?.click())
    expect(onOpenLoadMedia).toHaveBeenCalled()
  })

  it('offers Load Media when the host extension is absent', () => {
    renderConsole({ extensionPresent: false })
    expect(container.textContent).toContain('Load Media')
    expect(container.textContent).toContain('Install Host Extension')
  })

  it('shows broadcast controls when media tab is open', () => {
    renderConsole({ mediaTabOpen: true, captureActive: false })
    expect(container.textContent).toContain('Start Broadcasting')
    expect(container.textContent).not.toContain('Load Media')
  })
})
