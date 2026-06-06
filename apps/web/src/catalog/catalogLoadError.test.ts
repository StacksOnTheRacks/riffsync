import { describe, expect, it } from 'vitest'
import {
  CATALOG_UNAVAILABLE_MESSAGE,
  CatalogLoadError,
  EPISODE_UNAVAILABLE_MESSAGE,
  formatCatalogUserError,
} from './catalogLoadError'

describe('formatCatalogUserError', () => {
  it('returns the user message from CatalogLoadError', () => {
    const err = new CatalogLoadError(CATALOG_UNAVAILABLE_MESSAGE, {
      devDetail: 'Catalog request failed (503)',
    })
    expect(formatCatalogUserError(err)).toBe(CATALOG_UNAVAILABLE_MESSAGE)
  })

  it('maps Failed to fetch to a friendly catalog message', () => {
    expect(formatCatalogUserError(new Error('Failed to fetch'))).toBe(CATALOG_UNAVAILABLE_MESSAGE)
  })

  it('hides internal HTTP status messages', () => {
    expect(formatCatalogUserError(new Error('Catalog request failed (503)'))).toBe(
      CATALOG_UNAVAILABLE_MESSAGE,
    )
  })

  it('hides build-time configuration hints', () => {
    expect(
      formatCatalogUserError(
        new Error('Set VITE_PUBLIC_API_BASE_URL at build time so the catalog can load from the API.'),
      ),
    ).toBe(CATALOG_UNAVAILABLE_MESSAGE)
  })

  it('supports episode-specific fallback copy', () => {
    expect(formatCatalogUserError(new Error('Failed to fetch'), EPISODE_UNAVAILABLE_MESSAGE)).toBe(
      EPISODE_UNAVAILABLE_MESSAGE,
    )
  })
})
