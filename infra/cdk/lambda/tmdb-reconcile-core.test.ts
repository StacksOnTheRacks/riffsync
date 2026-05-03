import { describe, expect, it, vi } from 'vitest';
import {
  buildResolvedImageUrl,
  fetchTmdbImageConfig,
  mapMovieDetailToDynamoPatch,
  reconcileOneItemForPatch,
  resolveMovieIdFromSearch,
} from './tmdb-reconcile-core';

const imgConfig = {
  secureBaseUrl: 'https://image.tmdb.org/t/p/',
  posterSize: 'w500',
  backdropSize: 'w780',
};

describe('buildResolvedImageUrl', () => {
  it('composes TMDB CDN URL', () => {
    expect(buildResolvedImageUrl(imgConfig, 'poster', '/abc.jpg')).toBe(
      'https://image.tmdb.org/t/p/w500/abc.jpg',
    );
  });
  it('returns null when path missing', () => {
    expect(buildResolvedImageUrl(imgConfig, 'poster', null)).toBeNull();
  });
});

describe('resolveMovieIdFromSearch', () => {
  it('returns none for empty', () => {
    expect(resolveMovieIdFromSearch([])).toBe('none');
  });
  it('returns ambiguous for multiple', () => {
    expect(resolveMovieIdFromSearch([{ id: 1 }, { id: 2 }])).toBe('ambiguous');
  });
  it('returns id for single', () => {
    expect(resolveMovieIdFromSearch([{ id: 42 }])).toEqual({ movieId: 42 });
  });
});

describe('mapMovieDetailToDynamoPatch', () => {
  it('maps contract fields and omits TMDB title', () => {
    const patch = mapMovieDetailToDynamoPatch(
      {
        id: 99,
        tagline: 'Go for it',
        overview: 'Synopsis',
        popularity: 1.5,
        poster_path: '/p.jpg',
        backdrop_path: '/b.jpg',
      },
      imgConfig,
      '2026-05-03T12:00:00.000Z',
    );
    expect(patch).not.toHaveProperty('title');
    expect(patch).not.toHaveProperty('original_title');
    expect(patch.tagline).toBe('Go for it');
    expect(patch.tmdbOverview).toBe('Synopsis');
    expect(patch.tmdbPopularity).toBe(1.5);
    expect(patch.tmdbMovieId).toBe(99);
    expect(patch.posterImageUrl).toContain('w500');
    expect(patch.backdropImageUrl).toContain('w780');
    expect(patch.tmdbArtworkSyncedAt).toBe('2026-05-03T12:00:00.000Z');
  });
});

describe('fetchTmdbImageConfig', () => {
  it('parses configuration response', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        images: {
          secure_base_url: 'https://image.tmdb.org/t/p/',
          poster_sizes: ['w185', 'w500'],
          backdrop_sizes: ['w300', 'w780'],
        },
      }),
    })) as typeof fetch;
    const c = await fetchTmdbImageConfig('tok', fetchImpl);
    expect(c.posterSize).toBe('w500');
    expect(c.backdropSize).toBe('w780');
  });
});

describe('reconcileOneItemForPatch', () => {
  it('uses tmdbMovieId shortcut without search', async () => {
    const movieFixture = {
      id: 555,
      tagline: 'Hi',
      overview: 'O',
      popularity: 2,
      poster_path: '/x.jpg',
      backdrop_path: null,
    };
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/movie/555')) {
        return { ok: true, json: async () => movieFixture };
      }
      return { ok: false, status: 404 };
    }) as typeof fetch;

    const r = await reconcileOneItemForPatch(
      {
        id: 'ep-1',
        title: 'Whatever',
        tmdbMovieId: 555,
      },
      'token',
      imgConfig,
      fetchImpl,
      '2026-01-01T00:00:00.000Z',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.patch.tmdbMovieId).toBe(555);
    }
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes('/search/movie'))).toBe(false);
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes('/movie/555'))).toBe(true);
  });

  it('searches when tmdbMovieId missing', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/search/movie')) {
        return { ok: true, json: async () => ({ results: [{ id: 900 }] }) };
      }
      if (u.includes('/movie/900')) {
        return {
          ok: true,
          json: async () => ({
            id: 900,
            tagline: null,
            overview: null,
            popularity: null,
            poster_path: null,
            backdrop_path: null,
          }),
        };
      }
      return { ok: false, status: 500 };
    }) as typeof fetch;

    const r = await reconcileOneItemForPatch(
      { id: 'ep-2', title: 'Unique Movie Title' },
      'token',
      imgConfig,
      fetchImpl,
      '2026-01-01T00:00:00.000Z',
    );
    expect(r.ok).toBe(true);
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes('/search/movie'))).toBe(true);
  });
});
