// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminCatalogForm } from './AdminCatalogForm'
import { EMPTY_CATALOG_EPISODE_FORM_VALUES } from '../../catalog/validateCatalogEpisodeForm'
import type { StaffCatalogEpisode } from '../../api/staffAdminCatalogApi'

const navigate = vi.fn()
const createStaffCatalogEpisode = vi.fn()
const patchStaffCatalogEpisode = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

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
    createStaffCatalogEpisode: (...args: unknown[]) => createStaffCatalogEpisode(...args),
    patchStaffCatalogEpisode: (...args: unknown[]) => patchStaffCatalogEpisode(...args),
  }
})

vi.mock('../../admin/useAdminSession', () => ({
  useAdminSession: () => ({
    session: { sub: 'op', email: 'op@test', groups: ['admin'] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))

vi.mock('./AdminCatalogDeleteControl', () => ({
  AdminCatalogDeleteControl: () => null,
}))

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const baseEpisode: StaffCatalogEpisode = {
  id: 'ep-1',
  experimentNumber: 101,
  title: 'Original',
  era: 'joel',
  youtubeVideoId: null,
  youtubeWatchUrl: null,
  tagline: 'A tagline',
  posterImageUrl: 'https://example.test/poster.jpg',
  backdropImageUrl: null,
  tmdbMovieId: 42,
  tmdbArtworkSyncedAt: '2024-01-01T00:00:00.000Z',
  carousel: false,
  movieSearchTitle: 'Manos',
  embedAllows: true,
  curatorNotes: 'Notes',
  youtubeThumbnailUrl: null,
}

describe('AdminCatalogForm', () => {
  let container: HTMLDivElement
  let root: Root | null = null
  let queryClient: QueryClient

  beforeEach(() => {
    navigate.mockReset()
    createStaffCatalogEpisode.mockReset()
    patchStaffCatalogEpisode.mockReset()
    createStaffCatalogEpisode.mockResolvedValue({ entry: { id: 'new-ep' } })
    patchStaffCatalogEpisode.mockResolvedValue({ entry: baseEpisode })
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
  })

  function renderForm(
    props: Partial<Parameters<typeof AdminCatalogForm>[0]> & { mode: 'create' | 'edit' },
  ) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const defaults = {
      initialEpisode: null as StaffCatalogEpisode | null,
      initialValues: EMPTY_CATALOG_EPISODE_FORM_VALUES,
      breadcrumbLeaf: 'New episode',
      pageTitle: 'New episode',
    }
    act(() => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AdminCatalogForm {...defaults} {...props} />
          </MemoryRouter>
        </QueryClientProvider>,
      )
    })
  }

  it('renders create fields and calls createStaffCatalogEpisode on save', async () => {
    renderForm({ mode: 'create' })

    const idInput = container.querySelector('#catalog-form-id') as HTMLInputElement
    const titleInput = container.querySelector('#catalog-form-title') as HTMLInputElement
    const experimentInput = container.querySelector('#catalog-form-experiment') as HTMLInputElement

    await act(async () => {
      setInputValue(idInput, 'new-ep')
      setInputValue(experimentInput, '99')
      setInputValue(titleInput, 'New title')
    })

    const form = container.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await vi.waitFor(() => {
      expect(createStaffCatalogEpisode).toHaveBeenCalledWith(
        'staff-token',
        'new-ep',
        expect.objectContaining({
          experimentNumber: 99,
          title: 'New title',
          era: 'other',
          youtubeVideoId: null,
          youtubeWatchUrl: null,
          carousel: false,
        }),
      )
    })

    expect(navigate).toHaveBeenCalledWith('/admin/catalog', { state: { saved: true } })
  })

  it('invalidates public catalog queries after successful create', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    renderForm({ mode: 'create' })

    const idInput = container.querySelector('#catalog-form-id') as HTMLInputElement
    const titleInput = container.querySelector('#catalog-form-title') as HTMLInputElement
    const experimentInput = container.querySelector('#catalog-form-experiment') as HTMLInputElement

    await act(async () => {
      setInputValue(idInput, 'new-ep')
      setInputValue(experimentInput, '99')
      setInputValue(titleInput, 'New title')
    })

    const form = container.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['catalog'] })
    })
  })

  it('edit mode keeps id out of PATCH and sends only changed fields', async () => {
    renderForm({
      mode: 'edit',
      initialEpisode: baseEpisode,
      initialValues: {
        id: baseEpisode.id,
        experimentNumber: String(baseEpisode.experimentNumber),
        title: baseEpisode.title,
        era: baseEpisode.era,
        youtubeVideoId: '',
        youtubeWatchUrl: '',
        carousel: baseEpisode.carousel,
      },
      breadcrumbLeaf: 'Edit',
      pageTitle: 'Edit episode',
    })

    expect(container.querySelector('#catalog-form-id')).toBeNull()

    const titleInput = container.querySelector('#catalog-form-title') as HTMLInputElement
    await act(async () => {
      setInputValue(titleInput, 'Updated title')
    })

    const form = container.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await vi.waitFor(() => {
      expect(patchStaffCatalogEpisode).toHaveBeenCalledWith('staff-token', 'ep-1', {
        title: 'Updated title',
      })
    })
  })

  it('maps server validation errors to inline field messages', async () => {
    const { StaffCatalogValidationError } = await import('../../api/staffAdminCatalogApi')
    createStaffCatalogEpisode.mockRejectedValue(
      new StaffCatalogValidationError([{ instancePath: '/title', message: 'too short' }]),
    )

    renderForm({ mode: 'create' })

    const idInput = container.querySelector('#catalog-form-id') as HTMLInputElement
    const titleInput = container.querySelector('#catalog-form-title') as HTMLInputElement
    const experimentInput = container.querySelector('#catalog-form-experiment') as HTMLInputElement

    await act(async () => {
      setInputValue(idInput, 'new-ep')
      setInputValue(experimentInput, '1')
      setInputValue(titleInput, 'Ok title')
    })

    const form = container.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await vi.waitFor(() => {
      expect(container.textContent).toContain('too short')
    })
  })
})
