import { describe, expect, it } from 'vitest'
import {
  EMPTY_CATALOG_EPISODE_FORM_VALUES,
  mapValidationDetailsToFieldErrors,
  validateCatalogEpisodeForm,
} from './validateCatalogEpisodeForm'

const validCreate = {
  ...EMPTY_CATALOG_EPISODE_FORM_VALUES,
  id: '421-crow-magnum',
  experimentNumber: '421',
  title: 'Crow Magnum',
  era: 'mike' as const,
  youtubeVideoId: 'dQw4w9WgXcQ',
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

  it('rejects invalid era', () => {
    const result = validateCatalogEpisodeForm(
      { ...validCreate, era: 'invalid' as typeof validCreate.era },
      'create',
    )
    expect(result.fieldErrors.era).toBeTruthy()
  })

  it('rejects youtube video id with wrong length', () => {
    const result = validateCatalogEpisodeForm({ ...validCreate, youtubeVideoId: 'short' }, 'create')
    expect(result.fieldErrors.youtubeVideoId).toBeTruthy()
  })

  it('allows null youtube fields when empty strings', () => {
    const result = validateCatalogEpisodeForm(
      { ...validCreate, youtubeVideoId: '', youtubeWatchUrl: '' },
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
        { instancePath: '/era' },
      ]),
    ).toEqual({
      title: 'must not be empty',
      era: 'This value is not valid.',
    })
  })
})
