import { describe, expect, it } from 'vitest';
import {
  ADMIN_WRITABLE_KEYS,
  READ_ONLY_WRITE_KEYS,
  stripAndRejectReadOnly,
  validateCatalogEpisodePatch,
  validateCatalogEpisodePost,
  validatePathEpisodeId,
} from './admin-catalog-validation';

const validPostBody = {
  experimentNumber: 101,
  title: 'Test Episode',
  era: 'mike',
  youtubeVideoId: null,
  youtubeWatchUrl: null,
  carousel: false,
};

describe('admin-catalog-validation', () => {
  it('accepts valid POST payload and sets reconcile fields null', () => {
    const result = validateCatalogEpisodePost('test-episode', validPostBody);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.id).toBe('test-episode');
      expect(result.item.tagline).toBeNull();
      expect(result.item.posterImageUrl).toBeNull();
      expect(result.item.carousel).toBe(false);
    }
  });

  it('defaults carousel to false on POST when omitted', () => {
    const { carousel: _c, ...withoutCarousel } = validPostBody;
    const result = validateCatalogEpisodePost('test-episode', withoutCarousel);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.carousel).toBe(false);
    }
  });

  it('rejects read-only keys on write', () => {
    const rejected = stripAndRejectReadOnly({ tagline: 'nope' });
    expect(rejected?.ok).toBe(false);
    if (rejected && !rejected.ok) {
      expect(rejected.details.map((d) => d.instancePath)).toContain('/tagline');
    }
  });

  it('rejects POST body with forbidden reconcile field', () => {
    const result = validateCatalogEpisodePost('test-episode', {
      ...validPostBody,
      tagline: 'nope',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid era on POST', () => {
    const result = validateCatalogEpisodePost('test-episode', {
      ...validPostBody,
      era: 'invalid-era',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid slug in path', () => {
    const result = validatePathEpisodeId('Bad_Slug');
    expect(result?.ok).toBe(false);
  });

  it('merges PATCH writable keys and preserves reconcile fields', () => {
    const existing = {
      id: 'test-episode',
      experimentNumber: 101,
      title: 'Old title',
      era: 'mike',
      youtubeVideoId: null,
      youtubeWatchUrl: null,
      tagline: 'keep-me',
      posterImageUrl: 'https://example.test/poster.jpg',
      backdropImageUrl: null,
      tmdbMovieId: 42,
      tmdbArtworkSyncedAt: '2024-01-01T00:00:00.000Z',
      carousel: false,
      movieSearchTitle: 'Manos',
    };

    const result = validateCatalogEpisodePatch('test-episode', { title: 'New title' }, existing);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.title).toBe('New title');
      expect(result.item.tagline).toBe('keep-me');
      expect(result.item.movieSearchTitle).toBe('Manos');
    }
  });

  it('exports writable and read-only key lists', () => {
    expect(ADMIN_WRITABLE_KEYS).toContain('title');
    expect(READ_ONLY_WRITE_KEYS).toContain('tagline');
    expect(READ_ONLY_WRITE_KEYS).toContain('movieSearchTitle');
  });
});
