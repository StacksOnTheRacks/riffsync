// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DownloadAppPage } from './DownloadAppPage'

const promptInstall = vi.fn<() => Promise<boolean>>()
const usePwaInstallPrompt = vi.fn()

vi.mock('../pwa/usePwaInstallPrompt', () => ({
  usePwaInstallPrompt: () => usePwaInstallPrompt(),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('DownloadAppPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    promptInstall.mockReset()
    promptInstall.mockResolvedValue(true)
    usePwaInstallPrompt.mockReturnValue({
      canPrompt: false,
      isInstalled: false,
      promptInstall,
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderPage() {
    act(() => {
      root.render(<DownloadAppPage />)
    })
  }

  it('renders indexable install instructions for major browser families', () => {
    renderPage()

    expect(document.title).toBe('Install the RiffSync App - Download and Add to Home Screen')
    expect(container.querySelector('h1')?.textContent).toBe('Install the RiffSync app')
    expect(container.textContent).toContain('Chrome or Edge on desktop')
    expect(container.textContent).toContain('iPhone or iPad Safari')
    expect(container.textContent).toContain('Mac Safari')
    expect(container.textContent).toContain('Firefox and other browsers')
  })

  it('shows an install button when the browser prompt is available', async () => {
    usePwaInstallPrompt.mockReturnValue({
      canPrompt: true,
      isInstalled: false,
      promptInstall,
    })
    renderPage()

    const button = Array.from(container.querySelectorAll('button')).find(
      (el) => el.textContent === 'Install RiffSync',
    ) as HTMLButtonElement

    await act(async () => {
      button.click()
    })

    expect(promptInstall).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('RiffSync was added.')
  })

  it('shows already-installed copy instead of install CTA in standalone mode', () => {
    usePwaInstallPrompt.mockReturnValue({
      canPrompt: true,
      isInstalled: true,
      promptInstall,
    })
    renderPage()

    expect(container.textContent).toContain('You are using the installed app')
    expect(container.querySelector('button')).toBeNull()
  })
})
