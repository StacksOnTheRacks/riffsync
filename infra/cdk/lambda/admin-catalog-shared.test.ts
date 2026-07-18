import { describe, expect, it } from 'vitest';
import { projectAdminEpisode, sortEpisodes } from './admin-catalog-shared';
import { projectEpisode } from './catalog-shared';

const baseItem = {
  id: 'ep-1',
  experimentNumber: 101,
  title: 'Test Episode',
  catalog: 'mst3k',
  tags: ['Era: Mike'],
  labels: ['Mike'],
  youtubeVideoId: 'abc123',
  youtubeWatchUrl: 'https://www.youtube.com/watch?v=abc123',
  tagline: 'A tagline',
  posterImageUrl: null,
  backdropImageUrl: null,
  tmdbMovieId: null,
  tmdbArtworkSyncedAt: null,
  carousel: true,
  spotlight: false,
};

describe('projectAdminEpisode', () => {
  it('preserves public projectEpisode fields', () => {
    const admin = projectAdminEpisode(baseItem);
    const pub = projectEpisode(baseItem);
    expect(admin).toMatchObject(pub);
  });

  it('public projection omits staff-only hints but keeps embedAllows when stored', () => {
    const pub = projectEpisode({ ...baseItem, movieSearchTitle: 'Manos', embedAllows: false });
    expect(pub.embedAllows).toBe(false);
    expect(pub).not.toHaveProperty('movieSearchTitle');
  });

  it('maps staff-only operator hints when present', () => {
    const admin = projectAdminEpisode({
      ...baseItem,
      movieSearchTitle: 'Manos',
      embedAllows: false,
      tmdbNeedsReview: true,
      youtubeThumbnailUrl: 'https://img.youtube.com/vi/abc123/hqdefault.jpg',
    });
    expect(admin.movieSearchTitle).toBe('Manos');
    expect(admin.embedAllows).toBe(false);
    expect(admin.tmdbNeedsReview).toBe(true);
    expect(admin.youtubeThumbnailUrl).toBe('https://img.youtube.com/vi/abc123/hqdefault.jpg');
  });

  it('surfaces null for absent staff-only fields', () => {
    const admin = projectAdminEpisode(baseItem);
    expect(admin.movieSearchTitle).toBeNull();
    expect(admin.embedAllows).toBeNull();
    expect(admin.youtubeThumbnailUrl).toBeNull();
    expect(admin.tmdbNeedsReview).toBeUndefined();
  });
});

describe('sortEpisodes (admin re-export)', () => {
  it('sorts AdminEpisode rows by experimentNumber', () => {
    const a = projectAdminEpisode({ ...baseItem, id: 'b', experimentNumber: 200 });
    const b = projectAdminEpisode({ ...baseItem, id: 'a', experimentNumber: 100 });
    expect(sortEpisodes([a, b]).map((e) => e.id)).toEqual(['a', 'b']);
  });
});
