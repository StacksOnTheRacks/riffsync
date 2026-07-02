// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminCatalogDeleteControl } from './AdminCatalogDeleteControl'
import {
  StaffCatalogEpisodeInUseError,
  StaffCatalogEpisodeNotFoundError,
} from '../../api/staffAdminCatalogApi'

const navigate = vi.fn()
const deleteStaffCatalogEpisode = vi.fn()
const onEpisodeNotFound = vi.fn()

const useAdminSession = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

vi.mock('../../admin/useAdminSession', () => ({
  useAdminSession: () => useAdminSession(),
}))

vi.mock('../../auth/staffHostedUiPkce', () => ({
  refreshStaffTokensIfStale: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../auth/staffTokens', () => ({
  getStaffAccessToken: () => 'staff-token',
}))

vi.mock('../../api/staffAdminCatalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/staffAdminCatalogApi')>()
  return {
    ...actual,
    deleteStaffCatalogEpisode: (...args: unknown[]) => deleteStaffCatalogEpisode(...args),
  }
})

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('AdminCatalogDeleteControl', () => {
  let container: HTMLDivElement
  let root: Root | null = null
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    navigate.mockReset()
    deleteStaffCatalogEpisode.mockReset()
    onEpisodeNotFound.mockReset()
    deleteStaffCatalogEpisode.mockResolvedValue(undefined)
    useAdminSession.mockReturnValue({
      session: { sub: 'op', email: 'op@test', groups: ['admin'] },
      loading: false,
      error: null,
      reload: vi.fn(),
    })
  })

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
  })

  function renderControl(groups: string[] = ['admin']) {
    useAdminSession.mockReturnValue({
      session: { sub: 'op', email: 'op@test', groups },
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AdminCatalogDeleteControl episodeId="ep-1" onEpisodeNotFound={onEpisodeNotFound} />
          </MemoryRouter>
        </QueryClientProvider>,
      )
    })
  }

  it('hides delete control for curator-only session', () => {
    renderControl(['curator'])
    expect(container.textContent).not.toContain('Delete episode')
  })

  it('requires typing episode id before confirm proceeds', async () => {
    renderControl()

    const openBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete episode'),
    )!
    await act(async () => {
      openBtn.click()
    })

    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Delete',
    ) as HTMLButtonElement
    expect(deleteBtn.disabled).toBe(true)

    const confirmInput = container.querySelector('.riffsync-admin-modal__field') as HTMLInputElement
    await act(async () => {
      setInputValue(confirmInput, 'ep-1')
    })
    expect(deleteBtn.disabled).toBe(false)

    await act(async () => {
      deleteBtn.click()
    })

    await vi.waitFor(() => {
      expect(deleteStaffCatalogEpisode).toHaveBeenCalledWith('staff-token', 'ep-1')
      expect(navigate).toHaveBeenCalledWith('/admin/catalog', { state: { deleted: true } })
    })
  })

  it('shows 409 conflict copy with reference counts', async () => {
    deleteStaffCatalogEpisode.mockRejectedValue(
      new StaffCatalogEpisodeInUseError({ rooms: 2, lists: 1 }),
    )
    renderControl()

    const openBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete episode'),
    )!
    await act(async () => {
      openBtn.click()
    })

    const confirmInput = container.querySelector('.riffsync-admin-modal__field') as HTMLInputElement
    await act(async () => {
      setInputValue(confirmInput, 'ep-1')
    })

    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Delete',
    ) as HTMLButtonElement
    await act(async () => {
      deleteBtn.click()
    })

    await vi.waitFor(() => {
      const alert = container.querySelector('[role="alert"]')
      expect(alert?.textContent).toContain('2 active watch party room(s)')
      expect(alert?.textContent).toContain('1 list(s)')
    })
  })

  it('calls onEpisodeNotFound when delete returns 404', async () => {
    deleteStaffCatalogEpisode.mockRejectedValue(new StaffCatalogEpisodeNotFoundError())
    renderControl()

    const openBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete episode'),
    )!
    await act(async () => {
      openBtn.click()
    })

    const confirmInput = container.querySelector('.riffsync-admin-modal__field') as HTMLInputElement
    await act(async () => {
      setInputValue(confirmInput, 'ep-1')
    })

    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Delete',
    ) as HTMLButtonElement
    await act(async () => {
      deleteBtn.click()
    })

    await vi.waitFor(() => {
      expect(onEpisodeNotFound).toHaveBeenCalled()
    })
  })
})
