import { describe, expect, it } from 'vitest'
import { CATALOG_CATEGORIES, formatCatalogLabel, PUBLIC_CATALOG_CATEGORIES } from './catalogTypes'

describe('catalogTypes', () => {
  it('accepts tv_shows in CATALOG_CATEGORIES with admin label TV Shows', () => {
    expect(CATALOG_CATEGORIES).toContain('tv_shows')
    expect(formatCatalogLabel('tv_shows')).toBe('TV Shows')
  })

  it('keeps movie_night valid with admin label Movie Night', () => {
    expect(CATALOG_CATEGORIES).toContain('movie_night')
    expect(formatCatalogLabel('movie_night')).toBe('Movie Night')
  })

  it('includes tv_shows in PUBLIC_CATALOG_CATEGORIES and omits movie_night, other, and live', () => {
    expect(PUBLIC_CATALOG_CATEGORIES).toContain('tv_shows')
    expect(PUBLIC_CATALOG_CATEGORIES).not.toContain('movie_night')
    expect(PUBLIC_CATALOG_CATEGORIES).not.toContain('other')
    expect(PUBLIC_CATALOG_CATEGORIES).not.toContain('live')
  })
})
