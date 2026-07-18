import { describe, expect, it } from 'vitest';
import { projectEpisode } from './catalog-shared';

const baseItem = {
  id: 'ep-1',
  experimentNumber: 101,
  title: 'Test Episode',
  catalog: 'mst3k',
  tags: ['Era: Mike'],
  labels: ['Mike'],
  youtubeVideoId: null,
  youtubeWatchUrl: null,
  tagline: null,
  posterImageUrl: null,
  backdropImageUrl: null,
  tmdbMovieId: null,
  tmdbArtworkSyncedAt: null,
  carousel: false,
  spotlight: false,
};

describe('projectEpisode', () => {
  it('omits embedAllows when not stored on the row', () => {
    const entry = projectEpisode(baseItem);
    expect(entry).not.toHaveProperty('embedAllows');
  });

  it('includes embedAllows false when stored', () => {
    const entry = projectEpisode({ ...baseItem, embedAllows: false });
    expect(entry.embedAllows).toBe(false);
  });

  it('includes embedAllows true when stored', () => {
    const entry = projectEpisode({ ...baseItem, embedAllows: true });
    expect(entry.embedAllows).toBe(true);
  });

  it('defaults spotlight to false when omitted', () => {
    const entry = projectEpisode(baseItem);
    expect(entry.spotlight).toBe(false);
  });

  it('parses spotlight true from storage', () => {
    const entry = projectEpisode({ ...baseItem, spotlight: true });
    expect(entry.spotlight).toBe(true);
  });

  it('does not expose staff-only operator hints', () => {
    const entry = projectEpisode({
      ...baseItem,
      movieSearchTitle: 'Manos',
      embedAllows: false,
    });
    expect(entry).not.toHaveProperty('movieSearchTitle');
  });
});
