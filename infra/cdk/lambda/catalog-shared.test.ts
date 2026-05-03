import { describe, expect, it } from 'vitest';
import { projectEpisode, sortEpisodes } from './catalog-shared';

describe('projectEpisode', () => {
  it('maps a minimal seed-shaped row', () => {
    const row = {
      id: '101-the-crawling-eye',
      experimentNumber: 101,
      title: 'The Crawling Eye',
      era: 'joel',
      youtubeVideoId: 'lJgQrjYaLbQ',
      youtubeWatchUrl: 'https://www.youtube.com/watch?v=lJgQrjYaLbQ',
      tagline: null,
      posterImageUrl: null,
      backdropImageUrl: null,
      tmdbMovieId: null,
      tmdbArtworkSyncedAt: null,
    };
    const ep = projectEpisode(row);
    expect(ep.id).toBe('101-the-crawling-eye');
    expect(ep.experimentNumber).toBe(101);
    expect(ep.tagline).toBeNull();
    expect(ep.tmdbOverview).toBeUndefined();
    expect(ep.carousel).toBe(false);
  });

  it('sets carousel from the stored attribute', () => {
    const on = projectEpisode({
      id: 'x',
      experimentNumber: 1,
      title: 'T',
      era: 'joel',
      youtubeVideoId: null,
      youtubeWatchUrl: null,
      tagline: null,
      posterImageUrl: null,
      backdropImageUrl: null,
      tmdbMovieId: null,
      tmdbArtworkSyncedAt: null,
      carousel: true,
    });
    expect(on.carousel).toBe(true);
    const off = projectEpisode({
      id: 'y',
      experimentNumber: 2,
      title: 'U',
      era: 'joel',
      youtubeVideoId: null,
      youtubeWatchUrl: null,
      tagline: null,
      posterImageUrl: null,
      backdropImageUrl: null,
      tmdbMovieId: null,
      tmdbArtworkSyncedAt: null,
      carousel: false,
    });
    expect(off.carousel).toBe(false);
  });

  it('preserves optional TMDB copy fields when present', () => {
    const row = {
      id: 'x',
      experimentNumber: 1,
      title: 'T',
      era: 'mike',
      youtubeVideoId: null,
      youtubeWatchUrl: null,
      tagline: 'Hi',
      posterImageUrl: 'https://example.com/p.jpg',
      backdropImageUrl: null,
      tmdbMovieId: 99,
      tmdbArtworkSyncedAt: '2026-05-01T00:00:00.000Z',
      tmdbOverview: 'Overview text',
      tmdbPopularity: 12.5,
      tmdbPosterPath: '/p.jpg',
      tmdbBackdropPath: '/b.jpg',
    };
    const ep = projectEpisode(row);
    expect(ep.tmdbOverview).toBe('Overview text');
    expect(ep.tmdbPopularity).toBe(12.5);
    expect(ep.tmdbPosterPath).toBe('/p.jpg');
  });
});

describe('sortEpisodes', () => {
  it('orders by experimentNumber ascending', () => {
    const a = projectEpisode({
      id: 'b',
      experimentNumber: 2,
      title: 'B',
      era: 'joel',
      youtubeVideoId: null,
      youtubeWatchUrl: null,
      tagline: null,
      posterImageUrl: null,
      backdropImageUrl: null,
      tmdbMovieId: null,
      tmdbArtworkSyncedAt: null,
    });
    const b = projectEpisode({
      id: 'a',
      experimentNumber: 1,
      title: 'A',
      era: 'joel',
      youtubeVideoId: null,
      youtubeWatchUrl: null,
      tagline: null,
      posterImageUrl: null,
      backdropImageUrl: null,
      tmdbMovieId: null,
      tmdbArtworkSyncedAt: null,
    });
    const sorted = sortEpisodes([a, b]).map((e) => e.id);
    expect(sorted).toEqual(['a', 'b']);
  });
});
