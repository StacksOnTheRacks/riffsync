import { describe, expect, it } from 'vitest'
import {
  EMPTY_CATALOG_EPISODE_FORM_VALUES,
  mapValidationDetailsToFieldErrors,
  normalizeNullableTextField,
  validateCatalogEpisodeForm,
} from './validateCatalogEpisodeForm'

const validCreate = {
  ...EMPTY_CATALOG_EPISODE_FORM_VALUES,
  id: '421-crow-magnum',
  experimentNumber: '421',
  title: 'Crow Magnum',
  catalog: 'mst3k' as const,
  tags: ['Era: Mike'],
  labels: ['Mike'],
  youtubeWatchUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
}

describe('validateCatalogEpisodeForm', () => {
  it('accepts a valid create payload', () => {
    const result = validateCatalogEpisodeForm(validCreate, 'create')
    expect(result.fieldErrors).toEqual({})
    expect(result.formError).toBeUndefined()
  })

  it('rejects invalid slug on create', () => {
    const result = validateCatalogEpisodeForm({ ...validCreate, id: 'Bad_Slug' }, 'create')
    expect(result.fieldErrors.id).toBeTruthy()
  })

  it('rejects negative experiment number', () => {
    const result = validateCatalogEpisodeForm({ ...validCreate, experimentNumber: '-1' }, 'create')
    expect(result.fieldErrors.experimentNumber).toBeTruthy()
  })

  it('rejects empty title on create', () => {
    const result = validateCatalogEpisodeForm({ ...validCreate, title: '   ' }, 'create')
    expect(result.fieldErrors.title).toBeTruthy()
  })

  it('rejects invalid catalog', () => {
    const result = validateCatalogEpisodeForm(
      { ...validCreate, catalog: 'invalid' as typeof validCreate.catalog },
      'create',
    )
    expect(result.fieldErrors.catalog).toBeTruthy()
  })

  it('allows null youtube URL when empty', () => {
    const result = validateCatalogEpisodeForm(
      { ...validCreate, youtubeWatchUrl: '' },
      'create',
    )
    expect(result.fieldErrors).toEqual({})
  })

  it('rejects invalid watch URL', () => {
    const result = validateCatalogEpisodeForm(
      { ...validCreate, youtubeWatchUrl: 'not-a-url' },
      'create',
    )
    expect(result.fieldErrors.youtubeWatchUrl).toBeTruthy()
  })

  it('does not validate id on edit', () => {
    const result = validateCatalogEpisodeForm(
      { ...validCreate, id: 'invalid slug!!!' },
      'edit',
    )
    expect(result.fieldErrors.id).toBeUndefined()
  })

  it('maps server validation details to field keys', () => {
    expect(
      mapValidationDetailsToFieldErrors([
        { instancePath: '/title', message: 'must not be empty' },
        { instancePath: '/catalog' },
      ]),
    ).toEqual({
      title: 'must not be empty',
      catalog: 'This value is not valid.',
    })
  })

  it('defaults embedAllows to true on empty create form', () => {
    expect(EMPTY_CATALOG_EPISODE_FORM_VALUES.embedAllows).toBe(true)
  })

  it('rejects movieSearchTitle over max length', () => {
    const result = validateCatalogEpisodeForm(
      { ...validCreate, movieSearchTitle: 'x'.repeat(257) },
      'create',
    )
    expect(result.fieldErrors.movieSearchTitle).toBeTruthy()
  })

  it('rejects tags and labels over max length', () => {
    expect(
      validateCatalogEpisodeForm({ ...validCreate, tags: ['x'.repeat(65)] }, 'create')
        .fieldErrors.tags,
    ).toBeTruthy()
    expect(
      validateCatalogEpisodeForm({ ...validCreate, labels: ['x'.repeat(33)] }, 'create')
        .fieldErrors.labels,
    ).toBeTruthy()
  })

  it('clears nullable hint fields when input is empty', () => {
    expect(normalizeNullableTextField('   ')).toBeNull()
    expect(normalizeNullableTextField('  Manos  ')).toBe('Manos')
  })

  it('validates tmdbMovieId on create', () => {
    const result = validateCatalogEpisodeForm({ ...validCreate, tmdbMovieId: 'abc' }, 'create')
    expect(result.fieldErrors.tmdbMovieId).toBeTruthy()
  })

  it('rejects invalid tmdbMovieId on edit', () => {
    const result = validateCatalogEpisodeForm({ ...validCreate, tmdbMovieId: 'abc' }, 'edit')
    expect(result.fieldErrors.tmdbMovieId).toBeTruthy()
  })
})
