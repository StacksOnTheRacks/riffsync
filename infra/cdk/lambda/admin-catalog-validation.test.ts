import { describe, expect, it } from 'vitest';
import {
  ADMIN_WRITABLE_KEYS,
  validateCatalogEpisodePatch,
  validateCatalogEpisodePost,
} from './admin-catalog-validation';

const requiredPostBody = {
  experimentNumber: 101,
  title: 'Test Episode',
  catalog: 'mst3k',
  tags: ['Era: Mike'],
  labels: [],
  youtubeVideoId: null,
  youtubeWatchUrl: null,
};

const existingItem = {
  id: 'ep-1',
  experimentNumber: 101,
  title: 'Test Episode',
  catalog: 'mst3k',
  tags: ['Era: Mike'],
  labels: [],
  youtubeVideoId: null,
  youtubeWatchUrl: null,
  tagline: null,
  posterImageUrl: null,
  backdropImageUrl: null,
  tmdbMovieId: null,
  tmdbArtworkSyncedAt: null,
  carousel: false,
  spotlight: false,
  movieSearchTitle: 'Old title',
  embedAllows: true,
};

describe('ADMIN_WRITABLE_KEYS', () => {
  it('includes operator hint and taxonomy fields', () => {
    expect(ADMIN_WRITABLE_KEYS).toEqual(
      expect.arrayContaining(['catalog', 'tags', 'labels', 'movieSearchTitle', 'tmdbMovieId', 'embedAllows']),
    );
  });
});

describe('validateCatalogEpisodePost', () => {
  it('defaults hint fields when omitted', () => {
    const result = validateCatalogEpisodePost('ep-1', requiredPostBody);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.embedAllows).toBe(true);
    expect(result.item.movieSearchTitle).toBeNull();
  });

  it('persists provided hint fields', () => {
    const result = validateCatalogEpisodePost('ep-1', {
      ...requiredPostBody,
      movieSearchTitle: 'The Crawling Eye',
      embedAllows: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.movieSearchTitle).toBe('The Crawling Eye');
    expect(result.item.embedAllows).toBe(false);
  });

  it('rejects tmdbNeedsReview on write', () => {
    const result = validateCatalogEpisodePost('ep-1', {
      ...requiredPostBody,
      tmdbNeedsReview: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.some((d) => d.instancePath === '/tmdbNeedsReview')).toBe(true);
  });

  it('rejects movieSearchTitle over maxLength', () => {
    const result = validateCatalogEpisodePost('ep-1', {
      ...requiredPostBody,
      movieSearchTitle: 'x'.repeat(257),
    });
    expect(result.ok).toBe(false);
  });

  it('rejects labels over maxLength', () => {
    const result = validateCatalogEpisodePost('ep-1', {
      ...requiredPostBody,
      labels: ['x'.repeat(33)],
    });
    expect(result.ok).toBe(false);
  });
});

describe('validateCatalogEpisodePatch', () => {
  it('allows partial hint updates', () => {
    const result = validateCatalogEpisodePatch(
      'ep-1',
      { embedAllows: false },
      existingItem,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.embedAllows).toBe(false);
    expect(result.item.movieSearchTitle).toBe('Old title');
  });

  it('clears nullable hint fields with null', () => {
    const result = validateCatalogEpisodePatch('ep-1', { movieSearchTitle: null }, existingItem);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.movieSearchTitle).toBeNull();
  });

  it('rejects tmdbNeedsReview on write', () => {
    const result = validateCatalogEpisodePatch('ep-1', { tmdbNeedsReview: false }, existingItem);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.some((d) => d.instancePath === '/tmdbNeedsReview')).toBe(true);
  });

  it('allows pinning tmdbMovieId and clears stale enrichment', () => {
    const result = validateCatalogEpisodePatch(
      'ep-1',
      { tmdbMovieId: 603 },
      {
        ...existingItem,
        posterImageUrl: 'https://example.test/old.jpg',
        tmdbArtworkSyncedAt: '2024-01-01T00:00:00.000Z',
        tmdbNeedsReview: true,
        tagline: 'Old tagline',
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.tmdbMovieId).toBe(603);
    expect(result.item.posterImageUrl).toBeNull();
    expect(result.item.tmdbArtworkSyncedAt).toBeNull();
    expect(result.item.tmdbNeedsReview).toBe(false);
    expect(result.item.tagline).toBeNull();
  });

  it('rejects invalid tmdbMovieId', () => {
    const result = validateCatalogEpisodePatch('ep-1', { tmdbMovieId: 0 }, existingItem);
    expect(result.ok).toBe(false);
  });
});
